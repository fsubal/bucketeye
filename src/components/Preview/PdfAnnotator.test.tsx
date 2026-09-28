// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Comment } from "@/domains/Annotation/model";
import {
  type Position,
  positionedComments,
  toSelector,
} from "@/domains/Annotation/position";
import type { ReviewedObject } from "@/domains/ReviewedObject/model";
import { Temporal } from "@/utils/datetime";
import type { LoadedPdf } from "./pdf";

// jsdom では PDF.js（canvas と worker）が動かないので、./pdf を差し替える
const loadPdf = vi.fn<(url: string) => Promise<LoadedPdf>>();
vi.mock("./pdf", () => ({
  loadPdf: (url: string) => loadPdf(url),
  isCancelled: () => false,
}));

const { default: PdfAnnotator } = await import("./PdfAnnotator");
const { Preview } = await import("./Preview");

let renderPage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  loadPdf.mockResolvedValue({
    numPages: 3,
    renderPage: renderPage as unknown as LoadedPdf["renderPage"],
    destroy: vi.fn(async () => {}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const comment = (id: string, position: Position): Comment => ({
  id,
  authorEmail: "a@example.com",
  authorName: "A",
  body: `comment ${id}`,
  selector: toSelector(position),
  createdAt: Temporal.Instant.from("2026-01-01T00:00:00Z"),
});

function renderPdf(
  opts: {
    comments?: Comment[];
    draft?: Position | null;
    activeId?: string | null;
  } = {},
) {
  const onDraftChange = vi.fn();
  const onActivate = vi.fn();
  const view = render(
    <PdfAnnotator
      fileUrl="/api/v1/files/k/doc.pdf"
      downloadUrl="https://s3.example/doc.pdf?dl"
      comments={positionedComments(opts.comments ?? [])}
      draft={opts.draft ?? null}
      onDraftChange={onDraftChange}
      activeId={opts.activeId ?? null}
      onActivate={onActivate}
    />,
  );
  return { onDraftChange, onActivate, view };
}

const pagesRendered = () => renderPage.mock.calls.map((c) => c[0] as number);

describe("PdfAnnotator", () => {
  test("同じオリジンの URL で読み、1 ページ目を描く。ページを移ると描き直す", async () => {
    const { onDraftChange } = renderPdf();
    await screen.findByText("/ 3");
    expect(loadPdf).toHaveBeenCalledWith("/api/v1/files/k/doc.pdf");
    await waitFor(() => expect(pagesRendered()).toContain(1));

    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));
    await waitFor(() => expect(pagesRendered()).toContain(2));
    expect(screen.getByLabelText("2 ページ目")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "このページを指定" }));
    expect(onDraftChange).toHaveBeenLastCalledWith({ kind: "page", page: 2 });
  });

  test("「範囲を指定」でページの上をドラッグすると、そのページ内の範囲になる", async () => {
    const { onDraftChange } = renderPdf();
    await screen.findByText("/ 3");
    const layer = screen.getByTestId("pdf-page");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 600,
    } as DOMRect);

    fireEvent.click(screen.getByRole("button", { name: "範囲を指定" }));
    fireEvent.pointerDown(layer, { clientX: 40, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 200, clientY: 180, pointerId: 1 });
    expect(onDraftChange).toHaveBeenLastCalledWith({
      kind: "page",
      page: 1,
      region: { x: 10, y: 10, w: 40, h: 20 },
    });
  });

  test("選ばれたコメントのページを開き、そのページの範囲の枠とページ全体へのコメントを出す", async () => {
    const comments = [
      comment("c1", { kind: "page", page: 1 }),
      comment("c2", {
        kind: "page",
        page: 3,
        region: { x: 5, y: 5, w: 10, h: 10 },
      }),
      comment("c3", { kind: "page", page: 3 }),
    ];
    const { onActivate } = renderPdf({ comments, activeId: "c2" });
    await screen.findByText("/ 3");
    await waitFor(() => expect(pagesRendered()).toContain(3));

    const box = screen.getByRole("button", { name: "コメント #2 の範囲" });
    expect(box).toHaveStyle({ left: "5%", top: "5%" });
    // 1 ページ目のコメント #1 の枠はこのページには出ない
    expect(
      screen.queryByRole("button", { name: "コメント #1 の範囲" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "コメント #3" }));
    expect(onActivate).toHaveBeenCalledWith("c3");

    // コメントのあるページへ移るボタン
    fireEvent.click(screen.getByRole("button", { name: "1 ページへ" }));
    await waitFor(() =>
      expect(screen.getByLabelText("1 ページ目")).toBeInTheDocument(),
    );
  });

  test("読み込めなければダウンロードの導線を出す", async () => {
    loadPdf.mockRejectedValue(new Error("Invalid PDF structure"));
    renderPdf();
    expect(
      await screen.findByText(
        "PDF を表示できませんでした: Invalid PDF structure",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("ダウンロードして開く")).toHaveAttribute(
      "href",
      "https://s3.example/doc.pdf?dl",
    );
  });
});

describe("Preview から", () => {
  test("PDF は遅延読み込みされ、同じオリジンの fileUrl を優先する", async () => {
    const object: ReviewedObject = {
      bucket: "b",
      key: "k/doc.pdf",
      name: "doc.pdf",
      etag: null,
      size: 1,
      contentType: "application/pdf",
      kind: "pdf",
      lastModified: null,
      status: "pending",
      statusUpdatedAt: null,
      reviewer: null,
      indexedAt: null,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Preview
          object={object}
          preview={{
            kind: "pdf",
            url: "https://s3.example/doc.pdf?presigned",
            fileUrl: "/api/v1/files/k/doc.pdf",
            downloadUrl: "https://s3.example/doc.pdf?dl",
          }}
          comments={[]}
          draft={null}
          onDraftChange={vi.fn()}
          activeId={null}
          onActivate={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByLabelText("1 ページ目")).toBeInTheDocument();
    expect(loadPdf).toHaveBeenCalledWith("/api/v1/files/k/doc.pdf");
  });
});
