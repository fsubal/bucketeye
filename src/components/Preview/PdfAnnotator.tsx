import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Group,
  Input,
  Label,
  NumberField,
} from "react-aria-components";
import type { Position } from "@/domains/Annotation/position";
import { isCancelled, loadPdf, type LoadedPdf } from "./pdf";
import type { AnnotationProps } from "./Preview";
import { DrawToggle, RegionLayer } from "./RegionLayer";

type PagePosition = Extract<Position, { kind: "page" }>;

/** ページの表示幅の上限（CSS ピクセル）。広い画面で文字が大きくなりすぎないように */
const MAX_PAGE_WIDTH = 900;

const toolbarButton = ({ isFocusVisible }: { isFocusVisible: boolean }) =>
  clsx(
    "rounded",
    "border",
    "border-gray-300",
    "bg-white",
    "px-2",
    "py-1",
    "text-gray-800",
    "outline-none",
    "hover:bg-gray-100",
    "disabled:opacity-40",
    isFocusVisible && ["ring-2", "ring-blue-400"],
  );

/**
 * PDF.js で 1 ページずつ描画し、位置指定コメントを付ける。
 * - 「このページを指定」: ページ全体へのコメント（page=N）
 * - 「範囲を指定」でドラッグ: ページ内の範囲へのコメント（page=N を xywh=percent: で絞り込む）
 * コメントが選ばれたらそのページを開き、範囲なら枠を強調する
 */
export default function PdfAnnotator({
  fileUrl,
  downloadUrl,
  comments,
  draft,
  onDraftChange,
  activeId,
  onActivate,
}: { fileUrl: string; downloadUrl: string } & AnnotationProps) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // 文書を読む
  useEffect(() => {
    let alive = true;
    let loaded: LoadedPdf | null = null;
    setPdf(null);
    setError(null);
    loadPdf(fileUrl).then(
      (doc) => {
        loaded = doc;
        if (alive) setPdf(doc);
        else void doc.destroy();
      },
      (e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      alive = false;
      void loaded?.destroy();
    };
  }, [fileUrl]);

  // 表示幅に合わせる（画面の大きさが変わったら描き直す）
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const update = () =>
      setWidth(Math.min(MAX_PAGE_WIDTH, Math.max(200, el.clientWidth - 32)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ページを描く。ページや幅が変わったら前の描画は中断する
  useEffect(() => {
    if (!pdf || !canvas.current || width === null) return;
    const handle = pdf.renderPage(page, canvas.current, width);
    handle.promise.catch((e: unknown) => {
      if (!isCancelled(e)) setError(e instanceof Error ? e.message : String(e));
    });
    return () => handle.cancel();
  }, [pdf, page, width]);

  const pages = comments.filter(
    (c): c is typeof c & { position: PagePosition } =>
      c.position.kind === "page",
  );

  // コメント欄でコメントが選ばれたら、そのページを開く
  const active = pages.find((c) => c.comment.id === activeId);
  useEffect(() => {
    if (active) setPage(active.position.page);
  }, [active?.comment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const numPages = pdf?.numPages ?? 1;
  const go = (n: number) => {
    setPage(Math.min(numPages, Math.max(1, n)));
    setDrawing(false);
  };

  const onThisPage = pages.filter((c) => c.position.page === page);
  const marks = onThisPage.flatMap(({ comment, position, number }) =>
    position.region
      ? [{ commentId: comment.id, number, region: position.region }]
      : [],
  );
  const wholePage = onThisPage.filter((c) => !c.position.region);
  const pagesWithComments = [
    ...new Set(pages.map((c) => c.position.page)),
  ].sort((a, b) => a - b);
  const draftRegion =
    draft?.kind === "page" && draft.page === page
      ? (draft.region ?? null)
      : null;

  if (error) {
    return (
      <div className={clsx("p-6", "text-sm", "text-red-700")}>
        <p>PDF を表示できませんでした: {error}</p>
        <a
          href={downloadUrl}
          className={clsx("mt-2", "inline-block", "underline")}
        >
          ダウンロードして開く
        </a>
      </div>
    );
  }

  return (
    <div ref={container}>
      <div
        className={clsx(
          "flex",
          "flex-wrap",
          "items-center",
          "gap-2",
          "border-b",
          "border-gray-200",
          "bg-white",
          "p-3",
          "text-xs",
          "text-gray-600",
        )}
      >
        <Button
          aria-label="前のページ"
          isDisabled={!pdf || page <= 1}
          onPress={() => go(page - 1)}
          className={toolbarButton}
        >
          ‹
        </Button>
        <NumberField
          aria-label="ページ"
          value={page}
          onChange={(n) => go(Number.isFinite(n) ? n : 1)}
          minValue={1}
          maxValue={numPages}
          step={1}
          isDisabled={!pdf}
          className={clsx("flex", "items-center", "gap-1")}
        >
          <Label className="sr-only">ページ</Label>
          <Group
            className={clsx(
              "flex",
              "rounded",
              "border",
              "border-gray-300",
              "focus-within:ring-2",
              "focus-within:ring-blue-400",
            )}
          >
            <Input
              className={clsx("w-10", "px-1", "text-center", "outline-none")}
            />
          </Group>
          <span>/ {pdf ? numPages : "-"}</span>
        </NumberField>
        <Button
          aria-label="次のページ"
          isDisabled={!pdf || page >= numPages}
          onPress={() => go(page + 1)}
          className={toolbarButton}
        >
          ›
        </Button>

        <span className={clsx("mx-1", "h-4", "w-px", "bg-gray-200")} />

        <Button
          isDisabled={!pdf}
          onPress={() => onDraftChange({ kind: "page", page })}
          className={toolbarButton}
        >
          このページを指定
        </Button>
        <DrawToggle drawing={drawing} onChange={setDrawing} />

        {pagesWithComments.length > 0 && (
          <span className={clsx("ml-auto", "flex", "items-center", "gap-1")}>
            コメントのあるページ:
            {pagesWithComments.map((p) => (
              <Button
                key={p}
                aria-label={`${p} ページへ`}
                onPress={() => go(p)}
                className={({ isFocusVisible }) =>
                  clsx(
                    "rounded-full",
                    "px-1.5",
                    "outline-none",
                    p === page
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
                {p}
              </Button>
            ))}
          </span>
        )}
      </div>

      {wholePage.length > 0 && (
        <div
          className={clsx(
            "flex",
            "items-center",
            "gap-1",
            "bg-amber-50",
            "px-3",
            "py-1",
            "text-xs",
            "text-amber-900",
          )}
        >
          このページへのコメント:
          {wholePage.map(({ comment, number }) => (
            <Button
              key={comment.id}
              aria-label={`コメント #${number}`}
              onPress={() =>
                onActivate(comment.id === activeId ? null : comment.id)
              }
              className={clsx(
                "rounded-full",
                "px-1.5",
                "font-semibold",
                "text-white",
                comment.id === activeId ? "bg-amber-600" : "bg-amber-500",
              )}
            >
              #{number}
            </Button>
          ))}
        </div>
      )}

      <div
        className={clsx(
          "flex",
          "justify-center",
          "bg-gray-100",
          "p-4",
          drawing && ["ring-2", "ring-inset", "ring-blue-400"],
        )}
      >
        {!pdf && (
          <p className={clsx("py-20", "text-sm", "text-gray-500")}>
            PDF を読み込み中…
          </p>
        )}
        <div className={clsx(!pdf && "hidden")}>
          <RegionLayer
            testId="pdf-page"
            drawing={drawing}
            onDrawn={(region) => {
              onDraftChange({ kind: "page", page, region });
              setDrawing(false);
            }}
            onCancel={() => setDrawing(false)}
            marks={marks}
            draft={draftRegion}
            activeId={activeId}
            onActivate={onActivate}
          >
            <canvas
              ref={canvas}
              aria-label={`${page} ページ目`}
              className={clsx("block", "bg-white", "shadow")}
            />
          </RegionLayer>
        </div>
      </div>
      {drawing && (
        <p
          className={clsx(
            "border-t",
            "border-gray-200",
            "px-3",
            "py-1",
            "text-xs",
            "text-gray-600",
          )}
        >
          ページの上をドラッグして範囲を囲んでください（Esc でやめる）
        </p>
      )}
    </div>
  );
}
