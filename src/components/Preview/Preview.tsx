import { clsx } from "clsx";
import type { Preview as PreviewData } from "@/api/objects";
import type {
  Position,
  PositionedComment,
} from "@/domains/Annotation/position";
import type { ReviewedObject } from "@/domains/ReviewedObject/model";
import { ImageAnnotator } from "./ImageAnnotator";
import { MediaAnnotator } from "./MediaAnnotator";
import { PdfAnnotator } from "./PdfAnnotator";
import { TextAnnotator } from "./TextAnnotator";

/**
 * 位置指定コメントのためにプレビューが受け取るもの。状態は詳細ページ（pages/objects/show.tsx）が持ち、
 * コメント欄（CommentThread）と共有する:
 * - draft: これから投稿するコメントの位置（プレビュー上で指定する）
 * - activeId: コメント欄で選ばれたコメント。プレビューはその位置を示す（枠を強調、その時刻へ移動など）
 */
export type AnnotationProps = {
  comments: PositionedComment[];
  draft: Position | null;
  onDraftChange: (position: Position | null) => void;
  activeId: string | null;
  onActivate: (commentId: string | null) => void;
};

/**
 * contentType に応じてプレビューを出し分ける。ブラウザは presigned URL で S3 から直接取得する。
 * 種類ごとに付けられる位置は src/domains/Annotation/position.ts を参照
 */
export function Preview({
  object,
  preview,
  ...annotation
}: {
  object: ReviewedObject;
  preview: PreviewData;
} & AnnotationProps) {
  switch (preview.kind) {
    case "image":
      return (
        <ImageAnnotator
          src={preview.url ?? ""}
          alt={object.name}
          {...annotation}
        />
      );
    case "video":
    case "audio":
      return (
        <MediaAnnotator
          kind={preview.kind}
          src={preview.url ?? ""}
          {...annotation}
        />
      );
    case "pdf":
      return (
        <PdfAnnotator
          src={preview.url ?? ""}
          title={object.name}
          {...annotation}
        />
      );
    case "text":
      return <TextAnnotator objectKey={object.key} {...annotation} />;
    default:
      return (
        <div
          className={clsx("p-10", "text-center", "text-sm", "text-gray-600")}
        >
          <p>
            この形式（{object.contentType ?? "不明"}
            ）はブラウザでプレビューできません。
          </p>
          <a
            href={preview.downloadUrl}
            className={clsx(
              "mt-3",
              "inline-block",
              "rounded",
              "bg-gray-800",
              "px-3",
              "py-1.5",
              "text-white",
            )}
          >
            ダウンロードしてレビュー
          </a>
        </div>
      );
  }
}
