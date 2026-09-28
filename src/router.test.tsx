// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DevLoginSearch } from "@/pages/dev/login";
import { ObjectsSearch } from "@/pages/objects/index";
import { createAppRouter } from "@/router";

type Role = "admin" | "reviewer";

const me = (role: Role) => ({
  identity: {
    email: `${role}@example.com`,
    name: role,
    provider: "developer",
    role,
  },
  provider: { provider: "developer" },
  loginPath: "/dev/login",
  adminEmailsConfigured: true,
  headersPresent: [],
});

const objectList = {
  prefix: "",
  status: null,
  updatedSince: null,
  folders: [],
  objects: [],
  pagination: { page: 1, per: 100, total: 0 },
  counts: {},
  indexed: true,
  lastIndexRun: null,
};

const objectDetail = (key: string) => ({
  object: {
    bucket: "b",
    key,
    name: key.split("/").pop(),
    etag: null,
    size: 1,
    contentType: "image/png",
    kind: "image",
    lastModified: null,
    status: "pending",
    statusUpdatedAt: null,
    reviewer: null,
    indexedAt: null,
  },
  comments: [],
  preview: {
    kind: "image",
    downloadUrl: "https://s3.example/x",
    url: "https://s3.example/x",
  },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });

/** API をまねる。meResponse で /me の返事を切り替える。叩かれたパスは calls に残る */
function stubApi(meResponse: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    calls.push(url.pathname + url.search);
    if (url.pathname === "/api/v1/me") return meResponse();
    if (url.pathname === "/api/v1/config")
      return json({ bucket: "b", targetPrefix: "", statusStrategy: "tags" });
    if (url.pathname === "/api/v1/objects") return json(objectList);
    if (url.pathname.startsWith("/api/v1/objects/"))
      return json(
        objectDetail(
          decodeURIComponent(url.pathname.slice("/api/v1/objects/".length)),
        ),
      );
    if (url.pathname === "/api/v1/webhooks") return json({ webhooks: [] });
    return json({ type: "about:blank", title: "Not Found", status: 404 }, 404);
  });
  return calls;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(queryClient, {
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("認証のガード", () => {
  test("developer で未ログインなら、戻り先付きで /dev/login へ", async () => {
    stubApi(() =>
      json(
        {
          type: "x",
          title: "Authentication required",
          status: 401,
          loginPath: "/dev/login",
        },
        401,
      ),
    );
    const router = renderAt("/objects?status=approved");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/dev/login"),
    );
    expect(router.state.location.search).toEqual({
      redirect: "/objects?status=approved",
    });
    expect(await screen.findByText("開発用ログイン")).toBeInTheDocument();
  });

  test("前段プロキシのプロバイダで 401 なら「認証情報が届いていません」", async () => {
    stubApi(() =>
      json(
        {
          type: "x",
          title: "Authentication required",
          status: 401,
          loginPath: null,
        },
        401,
      ),
    );
    const router = renderAt("/objects");
    expect(
      await screen.findByText("認証情報が届いていません"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/objects");
  });

  test("/ は /objects へ行き、一覧（詳細ではなく）が出る", async () => {
    const calls = stubApi(() => json(me("reviewer")));
    const router = renderAt("/");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/objects"),
    );
    // /objects/$ の splat は空文字にも一致するので、一覧のルートが選ばれていることを API 呼び出しで確かめる
    await waitFor(() => expect(calls).toContain("/api/v1/objects"));
    expect(router.state.matches.map((m) => m.routeId).at(-1)).toBe(
      "/auth/objects/",
    );
  });

  test("/webhooks は admin だけ。reviewer は /objects へ戻される", async () => {
    stubApi(() => json(me("reviewer")));
    const r1 = renderAt("/webhooks");
    await waitFor(() => expect(r1.state.location.pathname).toBe("/objects"));
    cleanup();

    stubApi(() => json(me("admin")));
    const r2 = renderAt("/webhooks");
    expect(
      await screen.findByRole("heading", { name: "Webhook" }),
    ).toBeInTheDocument();
    expect(r2.state.location.pathname).toBe("/webhooks");
  });
});

describe("オブジェクトの詳細", () => {
  test("/objects/ 以降をスラッシュごとキーとして受け取る", async () => {
    const calls = stubApi(() => json(me("reviewer")));
    renderAt("/objects/submissions/2026%20issue/cover.png");
    expect(
      await screen.findByRole("heading", { name: "cover.png" }),
    ).toBeInTheDocument();
    expect(calls).toContain(
      "/api/v1/objects/submissions/2026%20issue/cover.png",
    );
  });
});

describe("検索パラメータ", () => {
  test("ObjectsSearch は不正な値を既定値にする", () => {
    expect(ObjectsSearch.parse({})).toEqual({ prefix: "", page: 1 });
    expect(
      ObjectsSearch.parse({ prefix: "a/", status: "approved", page: "3" }),
    ).toEqual({
      prefix: "a/",
      status: "approved",
      page: 3,
    });
    expect(
      ObjectsSearch.parse({ status: "bogus", page: "0", prefix: 1 }),
    ).toEqual({
      prefix: "",
      status: undefined,
      page: 1,
    });
  });

  test("一覧は検索パラメータを API に渡し、既定値は URL から消す", async () => {
    const calls = stubApi(() => json(me("reviewer")));
    const router = renderAt("/objects?prefix=a%2F&status=approved&page=1");
    await waitFor(() =>
      expect(calls).toContain("/api/v1/objects?prefix=a%2F&status=approved"),
    );
    expect(router.state.location.search).toEqual({
      prefix: "a/",
      status: "approved",
    });
  });

  test("DevLoginSearch は同じオリジン内のパスだけを戻り先にする（オープンリダイレクト対策）", () => {
    expect(DevLoginSearch.parse({ redirect: "/objects?x=1" })).toEqual({
      redirect: "/objects?x=1",
    });
    expect(DevLoginSearch.parse({ redirect: "//evil.example/" })).toEqual({
      redirect: undefined,
    });
    expect(DevLoginSearch.parse({ redirect: "https://evil.example/" })).toEqual(
      {
        redirect: undefined,
      },
    );
  });
});

describe("<title>（ルートの head）", () => {
  test.each([
    ["/objects", "reviewer", "一覧 — bucketeye"],
    [
      "/objects?prefix=a%2F&status=approved",
      "reviewer",
      "承認 · a/ — bucketeye",
    ],
    [
      "/objects/submissions/2026%20issue/cover.png",
      "reviewer",
      "cover.png — bucketeye",
    ],
    ["/whoami", "reviewer", "whoami — bucketeye"],
    ["/webhooks", "admin", "Webhook — bucketeye"],
    ["/no/such/page", "reviewer", "bucketeye"],
  ] as const)("%s → %s", async (path, role, title) => {
    stubApi(() => json(me(role)));
    renderAt(path);
    await waitFor(() => expect(document.title).toBe(title));
    // React 19 が <head> に移すので、<title> は head に 1 つだけで body には無い
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.body.querySelector("title")).toBeNull();
  });

  test("ログイン画面", async () => {
    stubApi(() =>
      json(
        {
          type: "x",
          title: "Authentication required",
          status: 401,
          loginPath: "/dev/login",
        },
        401,
      ),
    );
    renderAt("/objects");
    await waitFor(() => expect(document.title).toBe("ログイン — bucketeye"));
  });
});
