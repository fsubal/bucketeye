import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
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
import { HttpError } from "@/utils/http";

/**
 * ルーティング（TanStack Router、コードで定義）。
 * 画面そのものは src/pages に置き、ここではパス・検索パラメータ・認証のガードだけを決める。
 * ファイルベースのルーティングにしないのは、src/pages の命名（objects/index.tsx, objects/show.tsx）を保つため
 */

export type RouterContext = { queryClient: QueryClient };

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <p className="p-6 text-sm text-gray-500">ページが見つかりません</p>
  ),
});

const devLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/login",
  validateSearch: DevLoginSearch,
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
      if (e instanceof HttpError && e.status === 401 && e.loginPath) {
        throw redirect({
          to: "/dev/login",
          search: { redirect: location.href },
        });
      }
      throw e;
    }
  },
  pendingComponent: () => (
    <p className="p-6 text-sm text-gray-500">読み込み中…</p>
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
  if (error instanceof HttpError && error.status === 401) {
    return <Unauthenticated problem={error.problem} />;
  }
  const message = error instanceof Error ? error.message : String(error);
  return <p className="p-6 text-sm text-red-700">エラー: {message}</p>;
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
  component: function ObjectsShowRoute() {
    const { _splat } = objectsShowRoute.useParams();
    return <ObjectsShow objectKey={_splat ?? ""} />;
  },
});

const whoamiRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/whoami",
  component: function WhoamiRoute() {
    return <WhoamiShow me={useCurrentMe()} />;
  },
});

const webhooksRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/webhooks",
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
