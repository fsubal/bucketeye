import { clsx } from "clsx";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Button, ToggleButton } from "react-aria-components";
import type { Region } from "@/domains/Annotation/position";

type Point = { x: number; y: number };

/** 小さすぎる範囲（クリックしただけ）は範囲として扱わない。単位は対象に対する % */
const MIN_SIZE = 1;

const clamp = (n: number) => Math.min(100, Math.max(0, n));

function regionFrom(a: Point, b: Point): Region {
  return {
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

export type RegionMark = {
  commentId: string;
  number: number;
  region: Region;
};

/**
 * 画像や PDF のページ（children）の上に重ねる層。
 * - drawing 中はドラッグで範囲を描き、描き終えたら onDrawn に対象に対する百分率で渡す
 * - コメントの範囲（marks）に番号付きの枠を出し、押すとそのコメントを選ぶ
 * - 指定中の範囲（draft）を点線で出す
 * 百分率で持つので、表示の大きさや元の解像度が違っても同じ場所を指す
 */
export function RegionLayer({
  children,
  drawing,
  onDrawn,
  onCancel,
  marks,
  draft,
  activeId,
  onActivate,
  testId,
}: {
  children: ReactNode;
  drawing: boolean;
  onDrawn: (region: Region) => void;
  onCancel: () => void;
  marks: RegionMark[];
  draft: Region | null;
  activeId: string | null;
  onActivate: (commentId: string | null) => void;
  testId?: string;
}) {
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
    if (region.w >= MIN_SIZE && region.h >= MIN_SIZE) onDrawn(region);
  };

  return (
    <div
      ref={box}
      className={clsx(
        "relative",
        "inline-block",
        "touch-none",
        "select-none",
        drawing && "cursor-crosshair",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          start.current = null;
          setLive(null);
          onCancel();
        }
      }}
      data-testid={testId}
    >
      {children}

      {marks.map(({ commentId, number, region }) => {
        const active = commentId === activeId;
        return (
          <Button
            key={commentId}
            aria-label={`コメント #${number} の範囲`}
            onPress={() => onActivate(active ? null : commentId)}
            style={boxStyle(region)}
            className={({ isFocusVisible }) =>
              clsx(
                "absolute",
                "rounded-sm",
                "border-2",
                "outline-none",
                // 範囲を描いている間は既存の枠がドラッグの邪魔をしないように
                drawing && "pointer-events-none",
                active
                  ? ["border-amber-500", "bg-amber-400/25"]
                  : [
                      "border-amber-400/80",
                      "bg-transparent",
                      "hover:bg-amber-300/15",
                    ],
                isFocusVisible && ["ring-2", "ring-blue-400"],
              )
            }
          >
            <span
              className={clsx(
                "absolute",
                "-top-2.5",
                "-left-2.5",
                "flex",
                "size-5",
                "items-center",
                "justify-center",
                "rounded-full",
                "text-[10px]",
                "font-semibold",
                "text-white",
                active ? "bg-amber-600" : "bg-amber-500",
              )}
            >
              {number}
            </span>
          </Button>
        );
      })}

      {draft && !live && (
        <div
          data-testid="draft-region"
          style={boxStyle(draft)}
          className={clsx(
            "pointer-events-none",
            "absolute",
            "rounded-sm",
            "border-2",
            "border-dashed",
            "border-blue-600",
            "bg-blue-500/15",
          )}
        />
      )}
      {live && (
        <div
          style={boxStyle(live)}
          className={clsx(
            "pointer-events-none",
            "absolute",
            "border-2",
            "border-dashed",
            "border-blue-600",
            "bg-blue-500/10",
          )}
        />
      )}
    </div>
  );
}

/** 「範囲を指定」のトグル。画像と PDF で共通 */
export function DrawToggle({
  drawing,
  onChange,
}: {
  drawing: boolean;
  onChange: (drawing: boolean) => void;
}) {
  return (
    <ToggleButton
      isSelected={drawing}
      onChange={onChange}
      className={({ isSelected, isFocusVisible }) =>
        clsx(
          "rounded",
          "border",
          "px-2",
          "py-1",
          "text-xs",
          "outline-none",
          isSelected
            ? ["border-blue-600", "bg-blue-600", "text-white"]
            : [
                "border-gray-300",
                "bg-white",
                "text-gray-800",
                "hover:bg-gray-100",
              ],
          isFocusVisible && ["ring-2", "ring-blue-400"],
        )
      }
    >
      範囲を指定
    </ToggleButton>
  );
}
