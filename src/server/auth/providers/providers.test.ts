import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, test } from "vitest";
import type { AuthProvider } from "../provider";
import { AwsAlbProvider } from "./awsAlb";
import { CloudflareAccessProvider } from "./cloudflareAccess";
import { DeveloperProvider } from "./developer";
import { ForwardedHeaderProvider } from "./forwardedHeader";
import { GcpIapProvider } from "./gcpIap";

const ADMINS = ["admin@example.com"];

/** provider.identify を Hono の Context 越しに呼ぶ */
async function identify(
  provider: AuthProvider,
  headers: Record<string, string>,
) {
  const app = new Hono();
  app.get("/", async (c) => c.json({ identity: await provider.identify(c) }));
  const res = await app.request("/", { headers });
  return (
    (await res.json()) as {
      identity: { email: string; provider: string; role: string } | null;
    }
  ).identity;
}

describe("GcpIapProvider (ES256, iss/aud 検証)", () => {
  const setup = async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const provider = new GcpIapProvider({
      audience: "/projects/1/global/backendServices/2",
      adminEmails: ADMINS,
      keyResolver: async () => publicKey,
    });
    const token = (overrides: Record<string, unknown> = {}, key = privateKey) =>
      new SignJWT({ email: "alice@example.com", ...overrides })
        .setProtectedHeader({ alg: "ES256", kid: "k1" })
        .setIssuer(
          (overrides["iss"] as string) ?? "https://cloud.google.com/iap",
        )
        .setAudience(
          (overrides["aud"] as string) ??
            "/projects/1/global/backendServices/2",
        )
        .setExpirationTime((overrides["exp"] as string) ?? "5m")
        .sign(key);
    return { provider, token };
  };

  test("正しく署名された JWT から身元を取り出す", async () => {
    const { provider, token } = await setup();
    const id = await identify(provider, {
      "X-Goog-IAP-JWT-Assertion": await token(),
    });
    expect(id).toMatchObject({
      email: "alice@example.com",
      provider: "gcp_iap",
      role: "reviewer",
    });
  });

  test("別の鍵・期限切れ・aud 不一致・iss 不一致は拒否する", async () => {
    const { provider, token } = await setup();
    const other = await generateKeyPair("ES256");
    expect(
      await identify(provider, {
        "X-Goog-IAP-JWT-Assertion": await token({}, other.privateKey),
      }),
    ).toBeNull();
    expect(
      await identify(provider, {
        "X-Goog-IAP-JWT-Assertion": await token({ exp: "-1m" }),
      }),
    ).toBeNull();
    expect(
      await identify(provider, {
        "X-Goog-IAP-JWT-Assertion": await token({
          aud: "/projects/9/global/backendServices/9",
        }),
      }),
    ).toBeNull();
    expect(
      await identify(provider, {
        "X-Goog-IAP-JWT-Assertion": await token({
          iss: "https://evil.example",
        }),
      }),
    ).toBeNull();
  });

  test("メールヘッダだけで JWT が無い要求は認証しない（ヘッダ偽装対策）", async () => {
    const { provider } = await setup();
    expect(
      await identify(provider, {
        "X-Goog-Authenticated-User-Email":
          "accounts.google.com:mallory@example.com",
      }),
    ).toBeNull();
  });

  test("IAP_AUDIENCE 未設定は起動時に落ちる", () => {
    expect(
      () => new GcpIapProvider({ audience: undefined, adminEmails: [] }),
    ).toThrow(/IAP_AUDIENCE/);
  });
});

describe("AwsAlbProvider (ES256, kid ごとの PEM, signer 照合)", () => {
  test("kid で鍵を引いて検証し、signer が ALB_ARN と違えば拒否する", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const arn =
      "arn:aws:elasticloadbalancing:ap-northeast-1:123456789012:loadbalancer/app/x/abc";
    const provider = new AwsAlbProvider({
      region: "ap-northeast-1",
      arn,
      adminEmails: ADMINS,
      keyResolver: async (header) => {
        if ((header as Record<string, unknown>)["signer"] !== arn)
          throw new Error("unexpected signer");
        if (header.kid !== "kid-1") throw new Error("unknown kid");
        return publicKey;
      },
    });
    const sign = (kid: string, signer: string) =>
      new SignJWT({ email: "bob@example.com" })
        .setProtectedHeader({ alg: "ES256", kid, signer })
        .setExpirationTime("2m")
        .sign(privateKey);
    expect(
      await identify(provider, {
        "x-amzn-oidc-data": await sign("kid-1", arn),
      }),
    ).toMatchObject({ email: "bob@example.com", provider: "aws_alb" });
    expect(
      await identify(provider, {
        "x-amzn-oidc-data": await sign("kid-2", arn),
      }),
    ).toBeNull();
    expect(
      await identify(provider, {
        "x-amzn-oidc-data": await sign("kid-1", "arn:other"),
      }),
    ).toBeNull();
  });

  test("既定の鍵解決は PEM を取得して kid ごとにキャッシュし、signer を照合する", async () => {
    const { albKeyResolver } = await import("../keys");
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const { exportSPKI } = await import("jose");
    const pem = await exportSPKI(publicKey);
    let fetches = 0;
    const resolver = albKeyResolver("us-east-1", "arn:expected", async () => {
      fetches++;
      return new Response(pem, { status: 200 });
    });
    const kid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const header = { alg: "ES256", kid, signer: "arn:expected" };
    const key1 = await resolver(header, { header, payload: "" } as never);
    const key2 = await resolver(header, { header, payload: "" } as never);
    expect(key1).toBe(key2);
    expect(fetches).toBe(1);
    await expect(
      resolver({ ...header, signer: "arn:other" }, {
        header,
        payload: "",
      } as never),
    ).rejects.toThrow(/unexpected signer/);
    await expect(
      resolver({ alg: "ES256", kid: "../etc/passwd" }, {
        header,
        payload: "",
      } as never),
    ).rejects.toThrow(/kid/);
    void privateKey;
  });
});

describe("CloudflareAccessProvider (RS256)", () => {
  test("team domain の issuer と aud で検証する", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const provider = new CloudflareAccessProvider({
      teamDomain: "myteam.cloudflareaccess.com",
      audience: "aud-tag",
      adminEmails: ADMINS,
      keyResolver: async () => publicKey,
    });
    const sign = (aud: string) =>
      new SignJWT({ email: "carol@example.com" })
        .setProtectedHeader({ alg: "RS256", kid: "cf" })
        .setIssuer("https://myteam.cloudflareaccess.com")
        .setAudience([aud])
        .setExpirationTime("2m")
        .sign(privateKey);
    expect(
      await identify(provider, {
        "Cf-Access-Jwt-Assertion": await sign("aud-tag"),
      }),
    ).toMatchObject({ email: "carol@example.com" });
    expect(
      await identify(provider, {
        "Cf-Access-Jwt-Assertion": await sign("other"),
      }),
    ).toBeNull();
    void exportJWK;
  });
});

describe("ForwardedHeaderProvider / DeveloperProvider", () => {
  test("forwarded_header はヘッダのメールをそのまま信用する（ヘッダ名は変更可）", async () => {
    const provider = new ForwardedHeaderProvider({
      emailHeader: "X-Forwarded-Email",
      nameHeader: "X-Forwarded-Preferred-Username",
      adminEmails: ADMINS,
    });
    expect(
      await identify(provider, { "X-Forwarded-Email": "Dave@Example.com" }),
    ).toMatchObject({ email: "dave@example.com", role: "reviewer" });
    expect(
      await identify(provider, { "X-Forwarded-Email": "admin@example.com" }),
    ).toMatchObject({ role: "admin" });
    expect(await identify(provider, {})).toBeNull();
    const custom = new ForwardedHeaderProvider({
      emailHeader: "X-Auth-Request-Email",
      nameHeader: "X-Auth-Request-User",
      adminEmails: [],
    });
    expect(
      await identify(custom, { "X-Auth-Request-Email": "erin@example.com" }),
    ).toMatchObject({ email: "erin@example.com" });
  });

  test("developer は署名付き Cookie。改ざんされた Cookie は拒否する", async () => {
    const provider = new DeveloperProvider("secret-1234567890", ADMINS, false);
    const app = new Hono();
    app.post("/login", async (c) => {
      await provider.signIn(c, "frank@example.com", "Frank");
      return c.text("ok");
    });
    app.get("/me", async (c) =>
      c.json({ identity: await provider.identify(c) }),
    );
    const login = await app.request("/login", { method: "POST" });
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    const me = await app.request("/me", { headers: { Cookie: cookie } });
    expect(((await me.json()) as { identity: unknown }).identity).toMatchObject(
      { email: "frank@example.com", name: "Frank", provider: "developer" },
    );
    const tampered = await app.request("/me", {
      headers: { Cookie: cookie.replace(/\.[^.]+$/, ".AAAA") },
    });
    expect(
      ((await tampered.json()) as { identity: unknown }).identity,
    ).toBeNull();
  });
});
