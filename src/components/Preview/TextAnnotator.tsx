import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "react-aria-components";
import { getObjectText } from "@/api/objects";
import type { Position } from "@/domains/Annotation/position";
import type { AnnotationProps } from "./Preview";

type Lines = Extract<Position, { kind: "lines" }>;

const inRange = (n: number, r: Lines | null | undefined) =>
  !!r && n >= r.from && n <= r.to;

/**
 * テキスト。行番号を押すとその行、Shift を押しながら押すと範囲を指定する（RFC 5147 の line=）。
 * コメントの付いた行には色と番号を付け、コメントが選ばれたらその行までスクロールする
 */
export function TextAnnotator({
  objectKey,
  comments,
  draft,
  onDraftChange,
  activeId,
  onActivate,
}: { objectKey: string } & AnnotationProps) {
  const q = useQuery({
    queryKey: ["object-text", objectKey],
    queryFn: () => getObjectText(objectKey),
  });
  const anchor = useRef<number | null>(null);
  const rows = useRef(new Map<number, HTMLTableRowElement>());

  const ranges = comments.filter(
    (c): c is typeof c & { position: Lines } => c.position.kind === "lines",
  );
  const active = ranges.find((c) => c.comment.id === activeId);
  const selected = draft?.kind === "lines" ? draft : null;

  // 行番号 → その行に掛かっているコメントの番号
  const marks = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const { position, number } of ranges) {
      for (let n = position.from; n <= position.to; n++) {
        m.set(n, [...(m.get(n) ?? []), number]);
      }
    }
    return m;
  }, [ranges]);

  useEffect(() => {
    if (active) {
      rows.current
        .get(active.position.from)
        ?.scrollIntoView?.({ block: "center" });
    }
  }, [active?.comment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isPending)
    return <p className="p-4 text-sm text-gray-500">読み込み中…</p>;
  if (q.isError)
    return <p className="p-4 text-sm text-red-700">{q.error.message}</p>;

  const lines = q.data.text.replace(/\n$/, "").split("\n");

  const select = (n: number, extend: boolean) => {
    const from =
      extend && anchor.current !== null ? Math.min(anchor.current, n) : n;
    const to =
      extend && anchor.current !== null ? Math.max(anchor.current, n) : n;
    if (!extend) anchor.current = n;
    onDraftChange({ kind: "lines", from, to });
  };

  return (
    <div>
      <p className="border-b border-gray-200 px-4 py-2 text-xs text-gray-600">
        行番号を押すとその行、Shift を押しながら押すと範囲を指定できます
      </p>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse font-mono text-sm leading-relaxed">
          <tbody>
            {lines.map((line, i) => {
              const n = i + 1;
              const numbers = marks.get(n);
              return (
                <tr
                  key={n}
                  ref={(el) => {
                    if (el) rows.current.set(n, el);
                    else rows.current.delete(n);
                  }}
                  data-line={n}
                  className={clsx(
                    inRange(n, selected)
                      ? "bg-blue-100"
                      : inRange(n, active?.position)
                        ? "bg-amber-200"
                        : numbers && "bg-amber-50",
                  )}
                >
                  <td className="w-px align-top whitespace-nowrap select-none">
                    <Button
                      aria-label={`${n} 行目を指定`}
                      onPress={(e) => select(n, e.shiftKey)}
                      className={({ isFocusVisible }) =>
                        clsx(
                          "block w-full px-3 text-right text-xs text-gray-400 outline-none hover:text-gray-800",
                          isFocusVisible && "ring-2 ring-blue-400",
                        )
                      }
                    >
                      {n}
                    </Button>
                  </td>
                  <td className="w-px align-top whitespace-nowrap">
                    {numbers?.map((num) => {
                      const c = ranges.find((r) => r.number === num)!;
                      return (
                        <Button
                          key={num}
                          aria-label={`コメント #${num}`}
                          onPress={() => onActivate(c.comment.id)}
                          className="mr-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white"
                        >
                          {num}
                        </Button>
                      );
                    })}
                  </td>
                  <td className="pr-4 break-all whitespace-pre-wrap">
                    {line || " "}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {q.data.truncated && (
        <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          先頭 256KB のみ表示しています
        </p>
      )}
    </div>
  );
}
