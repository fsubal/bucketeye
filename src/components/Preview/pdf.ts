/**
 * PDF.js（pdfjs-dist）の呼び出しをここに閉じ込める。部品のテストではこのモジュールを差し替える
 * （jsdom には canvas も worker も無いので、PDF.js そのものは動かせない）。
 * worker は Vite に別ファイルとして出させ、その URL を渡す
 */
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

export type RenderHandle = {
  /** 描き終わったら解決する。cancel() されたら RenderingCancelledException で失敗する */
  promise: Promise<void>;
  cancel: () => void;
};

export type LoadedPdf = {
  numPages: number;
  /**
   * n ページ目（1 始まり）を幅 cssWidth（CSS ピクセル）に合わせて canvas に描く。
   * 高解像度の画面でぼやけないよう、canvas の実ピクセルは devicePixelRatio 倍にする
   */
  renderPage: (
    n: number,
    canvas: HTMLCanvasElement,
    cssWidth: number,
  ) => RenderHandle;
  destroy: () => Promise<void>;
};

export async function loadPdf(url: string): Promise<LoadedPdf> {
  // 同じオリジンの /api/v1/files から読むので、Cookie（developer ログイン）も前段プロキシの認証もそのまま効く
  const task = getDocument({ url });
  const doc: PDFDocumentProxy = await task.promise;
  return {
    numPages: doc.numPages,
    renderPage(n, canvas, cssWidth) {
      let renderTask: RenderTask | null = null;
      let cancelled = false;
      const promise = (async () => {
        const page = await doc.getPage(n);
        if (cancelled) throw new Error("cancelled");
        const base = page.getViewport({ scale: 1 });
        const scale = cssWidth / base.width;
        const dpr = globalThis.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(base.width * scale)}px`;
        canvas.style.height = `${Math.floor(base.height * scale)}px`;
        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
      })();
      return {
        promise,
        cancel() {
          cancelled = true;
          renderTask?.cancel();
        },
      };
    },
    // 6 系では文書の破棄は読み込みタスクの側で行う（worker との接続もここで閉じる）
    destroy: () => task.destroy(),
  };
}

/** 描画を中断したときの例外は無視してよい */
export function isCancelled(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "RenderingCancelledException" || e.message === "cancelled")
  );
}
