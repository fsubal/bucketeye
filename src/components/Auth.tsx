import { clsx } from "clsx";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getMe } from "@/api/session";
import type { Problem } from "@/domains/Problem/model";

/**
 * /me のクエリ。ルーターの beforeLoad（src/router.tsx）が認証の確認に使い、画面は同じキャッシュを読む。
 * ログイン・ログアウトの後は removeQueries で捨てること（invalidate だと古い身元が残ったまま beforeLoad を通ってしまう）
 */
export const meQueryOptions = queryOptions({
  queryKey: ["me"] as const,
  queryFn: getMe,
  retry: false,
  staleTime: 60_000,
});

/** 認証済みのルートの中で、現在の身元を返す（beforeLoad で取得済みなので待たない） */
export function useCurrentMe() {
  return useSuspenseQuery(meQueryOptions).data;
}

/** 前段プロキシの認証ヘッダが届いていないとき（developer 以外のプロバイダで 401）の画面 */
export function Unauthenticated({ problem }: { problem: Problem }) {
  return (
    <div
      className={clsx(
        "mx-auto",
        "mt-10",
        "max-w-xl",
        "rounded",
        "border",
        "border-red-200",
        "bg-white",
        "p-6",
        "text-sm",
      )}
    >
      <h1 className={clsx("mb-2", "text-lg", "font-semibold", "text-red-800")}>
        認証情報が届いていません
      </h1>
      <p className={clsx("mb-3", "text-gray-700")}>
        このアプリは前段のプロキシ（Google IAP / AWS ALB / Cloudflare Access /
        oauth2-proxy）が付ける認証ヘッダを前提にしています。
        プロキシを経由せずにアクセスしているか、プロキシの設定（audience
        など）が合っていない可能性があります。
      </p>
      <pre
        className={clsx(
          "overflow-auto",
          "rounded",
          "bg-gray-50",
          "p-3",
          "text-xs",
        )}
      >
        {JSON.stringify(problem, null, 2)}
      </pre>
    </div>
  );
}
