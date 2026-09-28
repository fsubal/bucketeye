import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { formatTimecode, type Position } from "@/domains/Annotation/position";
import type { AnnotationProps } from "./Preview";

type Time = Extract<Position, { kind: "time" }>;

/**
 * 動画・音声。再生中の時刻を「この時刻を指定」で位置にする。
 * コメントの時刻はプレイヤーの下のタイムラインに印を出し、選ぶとその時刻へ移動する
 */
export function MediaAnnotator({
  kind,
  src,
  comments,
  draft,
  onDraftChange,
  activeId,
  onActivate,
}: { kind: "video" | "audio"; src: string } & AnnotationProps) {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  const times = comments.filter(
    (c): c is typeof c & { position: Time } => c.position.kind === "time",
  );
  const draftTime = draft?.kind === "time" ? draft : null;

  const seek = (seconds: number) => {
    if (media.current) media.current.currentTime = seconds;
  };

  // コメント欄でコメントが選ばれたら、その時刻へ移動する
  const active = times.find((c) => c.comment.id === activeId);
  useEffect(() => {
    if (active) seek(active.position.start);
  }, [active?.comment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const Player = kind === "video" ? "video" : "audio";
  const at = (seconds: number) =>
    duration ? `${Math.min(100, (seconds / duration) * 100)}%` : "0%";

  return (
    <div className={clsx(kind === "audio" && "p-6")}>
      <Player
        ref={media}
        src={src}
        controls
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) =>
          setDuration(
            Number.isFinite(e.currentTarget.duration)
              ? e.currentTarget.duration
              : null,
          )
        }
        className={clsx("w-full", kind === "video" && "max-h-[70vh] bg-black")}
      />

      <div className="space-y-2 border-t border-gray-200 bg-white p-3">
        {duration !== null && (times.length > 0 || draftTime) && (
          <div
            className="relative h-5 rounded bg-gray-100"
            aria-label="コメントの時刻"
          >
            {times.map(({ comment, position, number }) => {
              const isActive = comment.id === activeId;
              return (
                <Button
                  key={comment.id}
                  aria-label={`コメント #${number}（${formatTimecode(position.start)}）`}
                  onPress={() => {
                    onActivate(comment.id);
                    seek(position.start);
                  }}
                  style={{ left: at(position.start) }}
                  className={({ isFocusVisible }) =>
                    clsx(
                      "absolute top-0 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white outline-none",
                      isActive ? "bg-amber-600" : "bg-amber-500",
                      isFocusVisible && "ring-2 ring-blue-400",
                    )
                  }
                >
                  {number}
                </Button>
              );
            })}
            {draftTime && (
              <span
                style={{ left: at(draftTime.start) }}
                className="absolute top-0 h-5 w-0.5 -translate-x-1/2 bg-blue-600"
                aria-hidden
              />
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <Button
            onPress={() =>
              onDraftChange({
                kind: "time",
                start: media.current?.currentTime ?? current,
              })
            }
            className={({ isFocusVisible }) =>
              clsx(
                "rounded border border-gray-300 bg-white px-2 py-1 text-gray-800 outline-none hover:bg-gray-100",
                isFocusVisible && "ring-2 ring-blue-400",
              )
            }
          >
            この時刻（{formatTimecode(current)}）を指定
          </Button>
          <span>再生を止めた所で押すと、その時刻へのコメントになります</span>
        </div>
      </div>
    </div>
  );
}
