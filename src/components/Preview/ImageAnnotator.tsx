import { clsx } from "clsx";
import { useState } from "react";
import type { Position } from "@/domains/Annotation/position";
import type { AnnotationProps } from "./Preview";
import { DrawToggle, RegionLayer } from "./RegionLayer";

type ImageRegion = Extract<Position, { kind: "region" }>;

/**
 * 画像の上をドラッグして範囲を指定する（xywh=percent:）。
 * 描く・枠を出す部分は PDF と共通の RegionLayer
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

  const marks = comments
    .filter(
      (c): c is typeof c & { position: ImageRegion } =>
        c.position.kind === "region",
    )
    .map(({ comment, position, number }) => ({
      commentId: comment.id,
      number,
      region: position,
    }));

  return (
    <div
      className={clsx(
        "flex",
        "flex-col",
        "items-center",
        "gap-3",
        "bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)]",
        "bg-size-[20px_20px]",
        "p-4",
      )}
    >
      <div
        className={clsx(
          "flex",
          "w-full",
          "flex-wrap",
          "items-center",
          "gap-2",
          "text-xs",
          "text-gray-600",
        )}
      >
        <DrawToggle drawing={drawing} onChange={setDrawing} />
        <span>
          {drawing
            ? "画像の上をドラッグして範囲を囲んでください（Esc でやめる）"
            : "範囲を指定してからコメントすると、その範囲へのコメントになります"}
        </span>
      </div>

      <RegionLayer
        testId="image-annotator"
        drawing={drawing}
        onDrawn={(region) => {
          onDraftChange({ kind: "region", ...region });
          setDrawing(false);
        }}
        onCancel={() => setDrawing(false)}
        marks={marks}
        draft={draft?.kind === "region" ? draft : null}
        activeId={activeId}
        onActivate={onActivate}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={clsx("block", "max-h-[70vh]", "max-w-full")}
        />
      </RegionLayer>
    </div>
  );
}
