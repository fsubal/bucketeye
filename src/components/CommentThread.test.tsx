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
import type { Comment } from "@/domains/Annotation/model";
import {
  type Position,
  positionedComments,
  toSelector,
} from "@/domains/Annotation/position";
import type { ReviewedObject } from "@/domains/ReviewedObject/model";
import { Temporal } from "@/utils/datetime";
import { CommentThread } from "./CommentThread";

const object: ReviewedObject = {
  bucket: "b",
  key: "k/notes.txt",
  name: "notes.txt",
  etag: null,
  size: 1,
  contentType: "text/plain",
  kind: "text",
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

function renderThread(opts: {
  comments?: Comment[];
  draft?: Position | null;
  activeId?: string | null;
}) {
  const comments = opts.comments ?? [];
  const onClearDraft = vi.fn();
  const onActivate = vi.fn();
  const onPosted = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CommentThread
        object={object}
        comments={comments}
        positioned={positionedComments(comments)}
        draft={opts.draft ?? null}
        onClearDraft={onClearDraft}
        activeId={opts.activeId ?? null}
        onActivate={onActivate}
        onPosted={onPosted}
      />
    </QueryClientProvider>,
  );
  return { onClearDraft, onActivate, onPosted };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommentThread", () => {
  test("位置を指定していれば selector を付けて投稿し、投稿後に位置を解除して親に知らせる", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          comment: {
            id: "new",
            authorEmail: "a@example.com",
            authorName: "A",
            body: "x",
            selector: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    const { onClearDraft, onPosted } = renderThread({
      draft: { kind: "lines", from: 3, to: 5 },
    });
    expect(screen.getByText("L3–5")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "コメント" }), {
      target: { value: "typo here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "投稿" }));
    await waitFor(() => expect(onClearDraft).toHaveBeenCalled());
    expect(onPosted).toHaveBeenCalled();
    expect(sent).toEqual([
      {
        body: "typo here",
        selector: {
          type: "FragmentSelector",
          conformsTo: "http://tools.ietf.org/rfc/rfc5147",
          value: "line=2,5",
        },
      },
    ]);
  });

  test("位置の無いコメントは selector なしで投稿し、種類ごとの案内を出す", () => {
    renderThread({});
    expect(
      screen.getByText("行番号を押すと、その行へのコメントになります"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "コメント" })).toHaveAttribute(
      "placeholder",
      "ファイル全体へのコメント",
    );
  });

  test("位置のチップに番号と位置を出し、押すとそのコメントを選ぶ（選択中なら解除）", () => {
    const comments = [
      comment("c0", null),
      comment("c1", { kind: "lines", from: 4, to: 4 }),
    ];
    const first = renderThread({ comments });
    const chip = screen.getByRole("button", { name: "#1 L4" });
    fireEvent.click(chip);
    expect(first.onActivate).toHaveBeenCalledWith("c1");
    cleanup();

    const second = renderThread({ comments, activeId: "c1" });
    fireEvent.click(screen.getByRole("button", { name: "#1 L4" }));
    expect(second.onActivate).toHaveBeenCalledWith(null);
  });

  test("「解除」で指定中の位置をやめる", () => {
    const { onClearDraft } = renderThread({
      draft: { kind: "lines", from: 1, to: 1 },
    });
    fireEvent.click(screen.getByRole("button", { name: "解除" }));
    expect(onClearDraft).toHaveBeenCalled();
  });
});
