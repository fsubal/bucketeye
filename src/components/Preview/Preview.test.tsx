// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Preview as PreviewData } from "@/api/objects";
import type { Comment } from "@/domains/Annotation/model";
import {
  type Position,
  positionedComments,
  toSelector,
} from "@/domains/Annotation/position";
import type { ReviewedObject } from "@/domains/ReviewedObject/model";
import { Temporal } from "@/utils/datetime";
import { Preview } from "./Preview";

const baseObject: ReviewedObject = {
  bucket: "b",
  key: "k/cover.png",
  name: "cover.png",
  etag: null,
  size: 1,
  contentType: "image/png",
  kind: "image",
  lastModified: null,
  status: "pending",
  statusUpdatedAt: null,
  reviewer: null,
  indexedAt: null,
};

const comment = (id: string, position: Position | null): Comment => ({
  id,
  authorEmail: "a@example.com",
  authorName: "A",
  body: `comment ${id}`,
  selector: position ? toSelector(position) : null,
  createdAt: Temporal.Instant.from("2026-01-01T00:00:00Z"),
});

function renderPreview(
  object: ReviewedObject,
  preview: PreviewData,
  opts: {
    comments?: Comment[];
    draft?: Position | null;
    activeId?: string | null;
  } = {},
) {
  const onDraftChange = vi.fn();
  const onActivate = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Preview
        object={object}
        preview={preview}
        comments={positionedComments(opts.comments ?? [])}
        draft={opts.draft ?? null}
        onDraftChange={onDraftChange}
        activeId={opts.activeId ?? null}
        onActivate={onActivate}
      />
    </QueryClientProvider>,
  );
  return { onDraftChange, onActivate };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const image: PreviewData = {
  kind: "image",
  url: "https://s3.example/x.png",
  downloadUrl: "https://s3.example/x.png?dl",
};

describe("画像", () => {
  test("画像を出す", () => {
    renderPreview(baseObject, image);
    expect(screen.getByAltText("cover.png")).toHaveAttribute(
      "src",
      "https://s3.example/x.png",
    );
  });

  test("「範囲を指定」を押してドラッグすると、画像に対する百分率の範囲になる", () => {
    const { onDraftChange } = renderPreview(baseObject, image);
    const box = screen.getByTestId("image-annotator");
    // 表示中の画像が 200x100 だとする
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    } as DOMRect);

    // 指定モードでなければドラッグしても何もしない
    fireEvent.pointerDown(box, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(box, { clientX: 120, clientY: 60, pointerId: 1 });
    expect(onDraftChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "範囲を指定" }));
    fireEvent.pointerDown(box, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 80, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(box, { clientX: 120, clientY: 60, pointerId: 1 });
    expect(onDraftChange).toHaveBeenCalledWith({
      kind: "region",
      x: 10,
      y: 10,
      w: 50,
      h: 50,
    });
  });

  test("クリックしただけ（小さすぎる範囲）は範囲にしない", () => {
    const { onDraftChange } = renderPreview(baseObject, image);
    const box = screen.getByTestId("image-annotator");
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    } as DOMRect);
    fireEvent.click(screen.getByRole("button", { name: "範囲を指定" }));
    fireEvent.pointerDown(box, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(box, { clientX: 21, clientY: 10, pointerId: 1 });
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  test("コメントの範囲に番号付きの枠を出し、押すとそのコメントを選ぶ", () => {
    const region: Position = { kind: "region", x: 10, y: 20, w: 30, h: 40 };
    const { onActivate } = renderPreview(baseObject, image, {
      comments: [comment("c0", null), comment("c1", region)],
    });
    // 位置の無いコメントは番号を取らない
    const box = screen.getByRole("button", { name: "コメント #1 の範囲" });
    expect(box).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "40%",
    });
    fireEvent.click(box);
    expect(onActivate).toHaveBeenCalledWith("c1");
  });

  test("指定中の範囲を点線で出す", () => {
    renderPreview(baseObject, image, {
      draft: { kind: "region", x: 1, y: 2, w: 3, h: 4 },
    });
    expect(screen.getByTestId("draft-region")).toHaveStyle({
      left: "1%",
      top: "2%",
    });
  });
});

describe("テキスト", () => {
  const text = {
    ...baseObject,
    key: "k/notes.txt",
    name: "notes.txt",
    contentType: "text/plain",
    kind: "text" as const,
  };
  const stubText = (body: string) =>
    vi.stubGlobal("fetch", async () => new Response(body, { status: 200 }));

  test("行番号でその行、Shift 付きで範囲を指定する", async () => {
    stubText("a\nb\nc\nd\ne\n");
    const { onDraftChange } = renderPreview(text, {
      kind: "text",
      downloadUrl: "x",
    });
    const line = async (n: number) =>
      screen.findByRole("button", { name: `${n} 行目を指定` });

    fireEvent.click(await line(2));
    expect(onDraftChange).toHaveBeenLastCalledWith({
      kind: "lines",
      from: 2,
      to: 2,
    });
    fireEvent.click(await line(4), { shiftKey: true });
    expect(onDraftChange).toHaveBeenLastCalledWith({
      kind: "lines",
      from: 2,
      to: 4,
    });
    // 末尾の改行で空の行は増えない
    expect(screen.queryByRole("button", { name: "6 行目を指定" })).toBeNull();
  });

  test("コメントの付いた行に番号を出し、押すとそのコメントを選ぶ", async () => {
    stubText("a\nb\nc\n");
    const { onActivate } = renderPreview(
      text,
      { kind: "text", downloadUrl: "x" },
      {
        comments: [comment("c1", { kind: "lines", from: 2, to: 3 })],
      },
    );
    const marks = await screen.findAllByRole("button", { name: "コメント #1" });
    expect(marks).toHaveLength(2); // 2 行目と 3 行目
    fireEvent.click(marks[0]!);
    expect(onActivate).toHaveBeenCalledWith("c1");
  });
});

describe("動画", () => {
  test("「この時刻を指定」で再生中の時刻を位置にする", async () => {
    const video = {
      ...baseObject,
      kind: "video" as const,
      contentType: "video/mp4",
    };
    const { onDraftChange } = renderPreview(video, {
      kind: "video",
      url: "https://s3.example/x.mp4",
      downloadUrl: "x",
    });
    const el = document.querySelector("video")!;
    Object.defineProperty(el, "currentTime", { value: 65.2, writable: true });
    fireEvent.timeUpdate(el);
    const button = await screen.findByRole("button", {
      name: "この時刻（1:05）を指定",
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(onDraftChange).toHaveBeenCalledWith({ kind: "time", start: 65.2 }),
    );
  });
});

describe("その他", () => {
  test("未対応の形式はダウンロード導線を出す", () => {
    renderPreview(
      { ...baseObject, kind: "other", contentType: "application/zip" },
      { kind: "other", downloadUrl: "https://s3.example/x.zip" },
    );
    expect(screen.getByText("ダウンロードしてレビュー")).toHaveAttribute(
      "href",
      "https://s3.example/x.zip",
    );
  });
});
