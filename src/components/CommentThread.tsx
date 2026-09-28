import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState } from "react";
import { Button } from "react-aria-components";
import { createComment } from "@/api/comments";
import type { Comment } from "@/domains/Annotation/model";
import {
  describePosition,
  type Position,
  type PositionedComment,
  positionKindFor,
  toSelector,
} from "@/domains/Annotation/position";
import type { ReviewedObject } from "@/domains/ReviewedObject/model";
import { formatDateTime, toIsoSeconds } from "@/utils/datetime";

/** 投稿欄の案内。ファイルの種類ごとに、プレビューでどう位置を指定するかを書く */
const HINTS = {
  region: "画像の「範囲を指定」で囲むと、その範囲へのコメントになります",
  time: "「この時刻を指定」を押すと、その時刻へのコメントになります",
  page: "「このページを指定」を押すと、そのページへのコメントになります",
  lines: "行番号を押すと、その行へのコメントになります",
} as const;

export function CommentThread({
  object,
  comments,
  positioned,
  draft,
  onClearDraft,
  activeId,
  onActivate,
}: {
  object: ReviewedObject;
  comments: Comment[];
  /** 位置付きのコメントと通し番号（プレビューと共通） */
  positioned: PositionedComment[];
  draft: Position | null;
  onClearDraft: () => void;
  activeId: string | null;
  onActivate: (commentId: string | null) => void;
}) {
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () =>
      createComment(object.key, {
        body,
        selector: draft ? toSelector(draft) : undefined,
      }),
    onSuccess: () => {
      setBody("");
      onClearDraft();
      void qc.invalidateQueries({ queryKey: ["object", object.key] });
    },
  });

  const byId = new Map(positioned.map((p) => [p.comment.id, p]));
  const kind = positionKindFor(object.kind);

  return (
    <section
      className={clsx(
        "rounded",
        "border",
        "border-gray-200",
        "bg-white",
        "p-4",
      )}
    >
      <h2 className={clsx("mb-3", "text-sm", "font-semibold", "text-gray-700")}>
        コメント ({comments.length})
      </h2>
      <ul className="space-y-3">
        {comments.length === 0 && (
          <li className={clsx("text-sm", "text-gray-500")}>
            まだコメントはありません
          </li>
        )}
        {comments.map((c) => {
          const p = byId.get(c.id);
          const active = c.id === activeId;
          return (
            <li
              key={c.id}
              className={clsx(
                "rounded",
                "p-3",
                "text-sm",
                active
                  ? ["bg-amber-50", "ring-2", "ring-amber-400"]
                  : "bg-gray-50",
              )}
            >
              <div
                className={clsx(
                  "mb-1",
                  "flex",
                  "items-baseline",
                  "justify-between",
                  "gap-2",
                  "text-xs",
                  "text-gray-500",
                )}
              >
                <span className={clsx("flex", "items-baseline", "gap-2")}>
                  {p && (
                    <Button
                      aria-pressed={active}
                      onPress={() => onActivate(active ? null : c.id)}
                      className={({ isFocusVisible }) =>
                        clsx(
                          "shrink-0",
                          "rounded-full",
                          "px-2",
                          "py-0.5",
                          "text-[11px]",
                          "font-semibold",
                          "whitespace-nowrap",
                          "outline-none",
                          active
                            ? ["bg-amber-600", "text-white"]
                            : [
                                "bg-amber-100",
                                "text-amber-900",
                                "hover:bg-amber-200",
                              ],
                          isFocusVisible && ["ring-2", "ring-blue-400"],
                        )
                      }
                    >
                      #{p.number} {describePosition(p.position)}
                    </Button>
                  )}
                  <span className={clsx("font-medium", "text-gray-700")}>
                    {c.authorName ?? c.authorEmail}
                  </span>
                </span>
                <time dateTime={toIsoSeconds(c.createdAt)}>
                  {formatDateTime(c.createdAt)}
                </time>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          );
        })}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) m.mutate();
        }}
        className={clsx("mt-4", "space-y-2")}
      >
        {draft ? (
          <div
            className={clsx(
              "flex",
              "items-center",
              "justify-between",
              "gap-2",
              "rounded",
              "bg-blue-50",
              "px-2",
              "py-1",
              "text-xs",
              "text-blue-900",
            )}
          >
            <span>
              位置: <strong>{describePosition(draft)}</strong>
              へのコメント
            </span>
            <Button
              onPress={onClearDraft}
              className={clsx(
                "rounded",
                "px-1.5",
                "text-blue-700",
                "hover:bg-blue-100",
              )}
            >
              解除
            </Button>
          </div>
        ) : (
          kind && (
            <p className={clsx("text-xs", "text-gray-500")}>{HINTS[kind]}</p>
          )
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          aria-label="コメント"
          placeholder={
            draft
              ? `${describePosition(draft)} へのコメント`
              : "ファイル全体へのコメント"
          }
          className={clsx(
            "w-full",
            "rounded",
            "border",
            "border-gray-300",
            "p-2",
            "text-sm",
          )}
        />
        {m.isError && (
          <p className={clsx("text-xs", "text-red-600")}>{m.error.message}</p>
        )}
        <div className="text-right">
          <button
            type="submit"
            disabled={m.isPending || !body.trim()}
            className={clsx(
              "rounded",
              "bg-gray-800",
              "px-3",
              "py-1.5",
              "text-sm",
              "text-white",
              "disabled:opacity-50",
            )}
          >
            投稿
          </button>
        </div>
      </form>
    </section>
  );
}
