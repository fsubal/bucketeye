import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getObject } from "@/api/objects";
import { CommentThread } from "@/components/CommentThread";
import { Preview } from "@/components/Preview";
import { StatusForm } from "@/components/StatusForm";
import { parentPrefixOf } from "@/domains/ReviewedObject/model";
import { formatBytes, formatDate } from "@/utils/format";

/** objectKey はルーターが /objects/$ の残り（_splat）から渡す。デコード済み */
export default function ObjectsShow({ objectKey: key }: { objectKey: string }) {
  const q = useQuery({
    queryKey: ["object", key],
    queryFn: () => getObject(key),
    enabled: key !== "",
  });

  if (q.isPending) return <p className="text-sm text-gray-500">読み込み中…</p>;
  if (q.isError)
    return <p className="text-sm text-red-700">{q.error.message}</p>;
  const { object, comments, preview } = q.data;
  const parent = parentPrefixOf(object.key);

  return (
    <>
      <div className="mb-4 text-sm">
        <Link to="/objects" className="text-blue-700 hover:underline">
          一覧
        </Link>
        {parent && (
          <>
            <span className="mx-1 text-gray-400">/</span>
            <span className="text-gray-600">{parent}</span>
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold break-all">{object.name}</h1>
          <p className="mt-1 text-xs text-gray-500">
            {object.contentType ?? "不明"} · {formatBytes(object.size)} · 更新{" "}
            {formatDate(object.lastModified)} · ETag {object.etag}
          </p>
        </div>
        <a
          href={preview.downloadUrl}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-100"
        >
          ダウンロード
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          <Preview object={object} preview={preview} />
        </div>
        <div className="space-y-4">
          <StatusForm object={object} />
          <CommentThread object={object} comments={comments} />
        </div>
      </div>
    </>
  );
}
