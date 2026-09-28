import { clsx } from "clsx";
import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Input,
  Label,
  NumberField,
} from "react-aria-components";
import type { Position } from "@/domains/Annotation/position";
import type { AnnotationProps } from "./Preview";

type Page = Extract<Position, { kind: "page" }>;

/**
 * PDF。ブラウザ内蔵のビューアを使うので、表示中のページ番号はアプリから読めない。
 * そのためページ番号を入力して指定する。コメントが選ばれたら URL の #page=N でそのページを開く（RFC 8118）。
 * ページ内の範囲の指定は PDF.js を組み込むまで対応しない
 */
export function PdfAnnotator({
  src,
  title,
  comments,
  onDraftChange,
  activeId,
}: { src: string; title: string } & AnnotationProps) {
  const active = comments.find(
    (c): c is typeof c & { position: Page } =>
      c.comment.id === activeId && c.position.kind === "page",
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (active) setPage(active.position.page);
  }, [active?.comment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPage = active?.position.page;
  return (
    <div>
      <iframe
        // ページを変えるときは iframe を作り直す（同じ URL のフラグメント違いでは読み込み直されないため）
        key={openPage ?? 0}
        src={openPage ? `${src}#page=${openPage}` : src}
        title={title}
        className="h-[75vh] w-full"
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white p-3 text-xs text-gray-600">
        <NumberField
          value={page}
          onChange={(n) => setPage(Number.isFinite(n) ? n : 1)}
          minValue={1}
          step={1}
          className="flex items-center gap-2"
        >
          <Label>ページ</Label>
          <Group className="flex rounded border border-gray-300 focus-within:ring-2 focus-within:ring-blue-400">
            <Button slot="decrement" className="px-2 text-gray-600">
              −
            </Button>
            <Input className="w-12 border-x border-gray-300 px-1 text-center outline-none" />
            <Button slot="increment" className="px-2 text-gray-600">
              ＋
            </Button>
          </Group>
        </NumberField>
        <Button
          onPress={() => onDraftChange({ kind: "page", page })}
          className={({ isFocusVisible }) =>
            clsx(
              "rounded border border-gray-300 bg-white px-2 py-1 text-gray-800 outline-none hover:bg-gray-100",
              isFocusVisible && "ring-2 ring-blue-400",
            )
          }
        >
          このページを指定
        </Button>
      </div>
    </div>
  );
}
