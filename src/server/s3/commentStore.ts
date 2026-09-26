import { Annotation, buildAnnotation, generateUlid, type Selector } from '@/domains/Annotation/model'
import type { Identity } from '@/domains/Identity/model'
import type { S3Port } from './port'
import { commentsPrefix } from './keys'

/**
 * コメントは 1 件 = 1 オブジェクト（<REVIEW_PREFIX>objects/<sha256(key)>/comments/<ULID>.json）。
 * 追記のみなので同時書き込みで競合せず、If-Match（CAS）に頼らなくてよい
 */
export class CommentStore {
  constructor(
    private readonly s3: S3Port,
    private readonly reviewPrefix: string,
  ) {}

  async list(key: string): Promise<Annotation[]> {
    const out: Annotation[] = []
    for await (const entry of this.s3.eachObject({ prefix: commentsPrefix(this.reviewPrefix, key), bucket: this.s3.reviewBucket })) {
      if (!entry.key.endsWith('.json')) continue
      const parsed = Annotation.safeParse(await this.s3.getJson(entry.key))
      if (parsed.success) out.push(parsed.data)
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }

  async append(key: string, input: { body: string; creator: Pick<Identity, 'email' | 'name'>; selector?: Selector }): Promise<Annotation> {
    const ulid = generateUlid()
    const annotation = buildAnnotation({ bucket: this.s3.bucket, key, body: input.body, creator: input.creator, selector: input.selector, ulid })
    await this.s3.putJson(`${commentsPrefix(this.reviewPrefix, key)}${ulid}.json`, annotation)
    return annotation
  }

  /** 再索引用: すべてのコメントを列挙する（対象キーは target.source から復元する） */
  async *eachAnnotation(): AsyncIterable<Annotation> {
    for await (const entry of this.s3.eachObject({ prefix: `${this.reviewPrefix}objects/`, bucket: this.s3.reviewBucket })) {
      if (!/\/comments\/[0-9A-HJKMNP-TV-Z]{26}\.json$/.test(entry.key)) continue
      const parsed = Annotation.safeParse(await this.s3.getJson(entry.key))
      if (parsed.success) yield parsed.data
    }
  }
}
