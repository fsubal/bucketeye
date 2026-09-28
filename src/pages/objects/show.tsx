import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getObject } from "@/api/objects";
import { CommentThread } from "@/components/CommentThread";
import { Preview } from "@/components/Preview/Preview";
import {
  type Position,
  positionedComments,
} from "@/domains/Annotation/position";
import { StatusForm } from "@/components/StatusForm";
import { parentPrefixOf } from "@/domains/ReviewedObject/model";
import { formatBytes } from "@/utils/format";
import { formatDateTime } from "@/utils/datetime";

/** objectKey はルーターが /objects/$ の残り（_splat）から渡す。デコード済み */
export default function ObjectsShow({ objectKey: key }: { objectKey: string }) {
  const q = useQuery({
    queryKey: ["object", key],
    queryFn: () => getObject(key),
    enabled: key !== "",
  });
  // 位置指定コメントの状態。プレビュー（指定する・示す）とコメント欄（投稿する・選ぶ）で共有する
  const [draft, setDraft] = useState<Position | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const positioned = useMemo(
    () => positionedComments(q.data?.comments ?? []),
    [q.data?.comments],
  );

  if (q.isPending)
    return <p className={clsx("text-sm", "text-gray-500")}>読み込み中…</p>;
  if (q.isError)
    return <p className={clsx("text-sm", "text-red-700")}>{q.error.message}</p>;
  const { object, comments, preview } = q.data;
  const parent = parentPrefixOf(object.key);

  return (
    <>
      <div className={clsx("mb-4", "text-sm")}>
        <Link
          to="/objects"
          className={clsx("text-blue-700", "hover:underline")}
        >
          一覧
        </Link>
        {parent && (
          <>
            <span className={clsx("mx-1", "text-gray-400")}>/</span>
            <span className="text-gray-600">{parent}</span>
          </>
        )}
      </div>

      <div
        className={clsx(
          "mb-4",
          "flex",
          "flex-wrap",
          "items-start",
          "justify-between",
          "gap-2",
        )}
      >
        <div>
          <h1 className={clsx("text-xl", "font-semibold", "break-all")}>
            {object.name}
          </h1>
          <p className={clsx("mt-1", "text-xs", "text-gray-500")}>
            {object.contentType ?? "不明"} · {formatBytes(object.size)} · 更新{" "}
            {formatDateTime(object.lastModified)} · ETag {object.etag}
          </p>
        </div>
        <a
          href={preview.downloadUrl}
          className={clsx(
            "rounded",
            "border",
            "border-gray-300",
            "bg-white",
            "px-3",
            "py-1.5",
            "text-sm",
            "hover:bg-gray-100",
          )}
        >
          ダウンロード
        </a>
      </div>

      <div
        className={clsx(
          "grid",
          "gap-4",
          "lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]",
        )}
      >
        <div
          className={clsx(
            "overflow-hidden",
            "rounded",
            "border",
            "border-gray-200",
            "bg-white",
          )}
        >
          <Preview
            object={object}
            preview={preview}
            comments={positioned}
            draft={draft}
            onDraftChange={(p) => {
              setDraft(p);
              setActiveId(null);
            }}
            activeId={activeId}
            onActivate={setActiveId}
          />
        </div>
        <div className="space-y-4">
          <StatusForm object={object} />
          <CommentThread
            object={object}
            comments={comments}
            positioned={positioned}
            draft={draft}
            onClearDraft={() => setDraft(null)}
            activeId={activeId}
            onActivate={setActiveId}
          />
        </div>
      </div>
    </>
  );
}
