import { clsx } from "clsx";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  HeadContent,
  Navigate,
  Outlet,
  redirect,
  stripSearchParams,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import {
  meQueryOptions,
  Unauthenticated,
  useCurrentMe,
} from "@/components/Auth";
import { Layout } from "@/components/Layout";
import DevLogin, { DevLoginSearch } from "@/pages/dev/login";
import ObjectsIndex, { ObjectsSearch } from "@/pages/objects/index";
import ObjectsShow from "@/pages/objects/show";
import WebhooksIndex from "@/pages/webhooks/index";
import WhoamiShow from "@/pages/whoami/show";
import { nameOf, REVIEW_STATUS_LABELS } from "@/domains/ReviewedObject/model";
import { HttpError } from "@/utils/http";

/**
 * ルーティング（TanStack Router、コードで定義）。
 * 画面そのものは src/pages に置き、ここではパス・検索パラメータ・認証のガードだけを決める。
 * ファイルベースのルーティングにしないのは、src/pages の命名（objects/index.tsx, objects/show.tsx）を保つため
 *
 * <title> は各ルートの head で決める（TanStack Router の head 管理）。一番深いルートの title が使われ、
 * 書いていないルートはルートのルートの "bucketeye" になる。
 * HeadContent は普通の <title> を描画し、React 19 がそれを <head> に移す
 */

export type RouterContext = { queryClient: QueryClient };

const APP_NAME = "bucketeye";

/** "cover.png" → "cover.png — bucketeye" */
export function pageTitle(...parts: Array<string | null | undefined>): string {
  return [...parts.filter((p): p is string => Boolean(p)), APP_NAME].join(
    " — ",
  );
}

const titleMeta = (...parts: Array<string | null | undefined>) => ({
  meta: [{ title: pageTitle(...parts) }],
});

const rootRoute = createRootRouteWithContext<RouterContext>()({
  head: () => titleMeta(),
  component: function Root() {
    return (
      <>
        <HeadContent />
        <Outlet />
      </>
    );
  },
  notFoundComponent: () => (
    <p className={clsx("p-6", "text-sm", "text-gray-500")}>
      ページが見つかりません
    </p>
  ),
});

const devLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/login",
  validateSearch: DevLoginSearch,
  head: () => titleMeta("ログイン"),
  component: function DevLoginRoute() {
    return (
      <Layout me={null}>
        <DevLogin search={devLoginRoute.useSearch()} />
      </Layout>
    );
  },
});

/**
 * 認証が要る画面の親（パスを持たないレイアウト用のルート）。
 * /me を react-query のキャッシュ経由で取り、未認証なら:
 *   - developer プロバイダ（loginPath がある）: /dev/login に戻り先付きでリダイレクト
 *   - 前段プロキシのプロバイダ: 「認証情報が届いていません」を出す（errorComponent）
 */
const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "auth",
  beforeLoad: async ({ context, location }) => {
    try {
      const me = await context.queryClient.query(meQueryOptions);
      return { me };
    } catch (e) {
      if (HttpError.isHttpError(e, 401) && e.loginPath) {
        throw redirect({
          to: "/dev/login",
          search: { redirect: location.href },
        });
      }

      throw e;
    }
  },
  pendingComponent: () => (
    <p className={clsx("p-6", "text-sm", "text-gray-500")}>読み込み中…</p>
  ),
  errorComponent: AuthError,
  component: function AuthLayout() {
    return (
      <Layout me={useCurrentMe()}>
        <Outlet />
      </Layout>
    );
  },
});

function AuthError({ error }: ErrorComponentProps) {
  if (HttpError.isHttpError(error, 401)) {
    return <Unauthenticated problem={error.problem} />;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    <p className={clsx("p-6", "text-sm", "text-red-700")}>エラー: {message}</p>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/",
  component: () => <Navigate to="/objects" replace />,
});

/**
 * /objects の下に一覧（index）と詳細（splat）を置く。
 * splat の `$` は空文字にも一致するので、兄弟に "/objects" と "/objects/$" を並べると
 * /objects が詳細（キーが空）の方に取られてしまう。親子にすると index が確実に優先される
 */
const objectsRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/objects",
});

const objectsIndexRoute = createRoute({
  getParentRoute: () => objectsRoute,
  path: "/",
  validateSearch: ObjectsSearch,
  // 既定値（prefix=""、page=1）は URL に出さない
  search: { middlewares: [stripSearchParams({ prefix: "", page: 1 })] },
  // "2026-10-issue/ — bucketeye"、ステータスで絞っているときは "承認 · 2026-10-issue/ — bucketeye"
  head: ({ match }) => {
    const { prefix, status } = match.search;
    const where = prefix || "一覧";
    return titleMeta(
      status ? `${REVIEW_STATUS_LABELS[status]} · ${where}` : where,
    );
  },
  component: function ObjectsIndexRoute() {
    return (
      <ObjectsIndex
        me={useCurrentMe()}
        search={objectsIndexRoute.useSearch()}
      />
    );
  },
});

/** オブジェクトのキーはスラッシュを含むので、/objects/ 以降をまるごと（splat）受ける */
const objectsShowRoute = createRoute({
  getParentRoute: () => objectsRoute,
  path: "$",
  // API の応答を待たず、キーの最後の部分（ファイル名）を題名にする
  head: ({ params }) => titleMeta(params._splat ? nameOf(params._splat) : null),
  component: function ObjectsShowRoute() {
    const { _splat } = objectsShowRoute.useParams();
    return <ObjectsShow objectKey={_splat ?? ""} />;
  },
});

const whoamiRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/whoami",
  head: () => titleMeta("whoami"),
  component: function WhoamiRoute() {
    return <WhoamiShow me={useCurrentMe()} />;
  },
});

const webhooksRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/webhooks",
  head: () => titleMeta("Webhook"),
  // admin 以外は一覧へ戻す（API 側でも 403 になる）
  beforeLoad: ({ context }) => {
    if (context.me.identity.role !== "admin") {
      throw redirect({ to: "/objects", replace: true });
    }
  },
  component: WebhooksIndex,
});

const routeTree = rootRoute.addChildren([
  devLoginRoute,
  authRoute.addChildren([
    indexRoute,
    objectsRoute.addChildren([objectsIndexRoute, objectsShowRoute]),
    whoamiRoute,
    webhooksRoute,
  ]),
]);

export function createAppRouter(
  queryClient: QueryClient,
  options: Pick<Parameters<typeof createRouter>[0], "history"> = {},
) {
  return createRouter({
    routeTree,
    context: { queryClient },
    // データの鮮度は react-query に任せる（ルーターのローダーは使っていない）
    defaultPreloadStaleTime: 0,
    ...options,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
