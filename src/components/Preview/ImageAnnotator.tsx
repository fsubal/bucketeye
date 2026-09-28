import { clsx } from "clsx";
import { useRef, useState, type PointerEvent } from "react";
import { Button, ToggleButton } from "react-aria-components";
import type { Position } from "@/domains/Annotation/position";
import type { AnnotationProps } from "./Preview";

type Region = Extract<Position, { kind: "region" }>;
type Point = { x: number; y: number };

/** 小さすぎる範囲（クリックしただけ）は範囲として扱わない。単位は画像に対する % */
const MIN_SIZE = 1;

const clamp = (n: number) => Math.min(100, Math.max(0, n));

function regionFrom(a: Point, b: Point): Region {
  return {
    kind: "region",
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

const boxStyle = (r: Region) => ({
  left: `${r.x}%`,
  top: `${r.y}%`,
  width: `${r.w}%`,
  height: `${r.h}%`,
});

/**
 * 画像の上をドラッグして範囲を指定する。範囲は表示中の画像に対する百分率（xywh=percent:）で持つので、
 * 画面の大きさや元画像の解像度が違っても同じ場所を指す
 */
export function ImageAnnotator({
  src,
  alt,
  comments,
  draft,
  onDraftChange,
  activeId,
  onActivate,
}: { src: string; alt: string } & AnnotationProps) {
  const [drawing, setDrawing] = useState(false);
  const [live, setLive] = useState<Region | null>(null);
  const start = useRef<Point | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const pointOf = (e: PointerEvent): Point => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100),
    };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!drawing || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = pointOf(e);
    setLive(regionFrom(start.current, start.current));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current) setLive(regionFrom(start.current, pointOf(e)));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const region = regionFrom(start.current, pointOf(e));
    start.current = null;
    setLive(null);
    if (region.w >= MIN_SIZE && region.h >= MIN_SIZE) {
      onDraftChange(region);
      setDrawing(false);
    }
  };

  const regions = comments.filter(
    (c): c is typeof c & { position: Region } => c.position.kind === "region",
  );
  const draftRegion = draft?.kind === "region" ? draft : null;

  return (
    <div className="flex flex-col items-center gap-3 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-size-[20px_20px] p-4">
      <div className="flex w-full flex-wrap items-center gap-2 text-xs text-gray-600">
        <ToggleButton
          isSelected={drawing}
          onChange={setDrawing}
          className={({ isSelected, isFocusVisible }) =>
            clsx(
              "rounded border px-2 py-1 text-xs outline-none",
              isSelected
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100",
              isFocusVisible && "ring-2 ring-blue-400",
            )
          }
        >
          範囲を指定
        </ToggleButton>
        <span>
          {drawing
            ? "画像の上をドラッグして範囲を囲んでください（Esc でやめる）"
            : "範囲を指定してからコメントすると、その範囲へのコメントになります"}
        </span>
      </div>

      <div
        ref={box}
        className={clsx(
          "relative inline-block touch-none select-none",
          drawing && "cursor-crosshair",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            start.current = null;
            setLive(null);
            setDrawing(false);
          }
        }}
        data-testid="image-annotator"
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="block max-h-[70vh] max-w-full"
        />

        {regions.map(({ comment, position, number }) => {
          const active = comment.id === activeId;
          return (
            <Button
              key={comment.id}
              aria-label={`コメント #${number} の範囲`}
              onPress={() => onActivate(active ? null : comment.id)}
              style={boxStyle(position)}
              className={({ isFocusVisible }) =>
                clsx(
                  "absolute rounded-sm border-2 outline-none",
                  // 範囲を描いている間は既存の枠がドラッグの邪魔をしないように
                  drawing && "pointer-events-none",
                  active
                    ? "border-amber-500 bg-amber-400/25"
                    : "border-amber-400/80 bg-transparent hover:bg-amber-300/15",
                  isFocusVisible && "ring-2 ring-blue-400",
                )
              }
            >
              <span
                className={clsx(
                  "absolute -top-2.5 -left-2.5 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                  active ? "bg-amber-600" : "bg-amber-500",
                )}
              >
                {number}
              </span>
            </Button>
          );
        })}

        {draftRegion && !live && (
          <div
            data-testid="draft-region"
            style={boxStyle(draftRegion)}
            className="pointer-events-none absolute rounded-sm border-2 border-dashed border-blue-600 bg-blue-500/15"
          />
        )}
        {live && (
          <div
            style={boxStyle(live)}
            className="pointer-events-none absolute border-2 border-dashed border-blue-600 bg-blue-500/10"
          />
        )}
      </div>
    </div>
  );
}
