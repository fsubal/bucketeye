import { clsx } from "clsx";
import type { Me } from "@/api/session";

export default function WhoamiShow({ me }: { me: Me }) {
  return (
    <>
      <h1 className={clsx("mb-4", "text-xl", "font-semibold")}>
        あなたは誰として見えているか
      </h1>
      <div className={clsx("grid", "gap-4", "md:grid-cols-2")}>
        <section
          className={clsx(
            "rounded",
            "border",
            "border-gray-200",
            "bg-white",
            "p-4",
            "text-sm",
          )}
        >
          <h2 className={clsx("mb-2", "font-semibold", "text-gray-700")}>
            身元
          </h2>
          <dl
            className={clsx(
              "grid",
              "grid-cols-[auto_1fr]",
              "gap-x-4",
              "gap-y-1",
            )}
          >
            <dt className="text-gray-500">email</dt>
            <dd>{me.identity.email}</dd>
            <dt className="text-gray-500">name</dt>
            <dd>{me.identity.name}</dd>
            <dt className="text-gray-500">role</dt>
            <dd>
              {me.identity.role}
              {!me.adminEmailsConfigured && (
                <span className={clsx("ml-2", "text-xs", "text-amber-700")}>
                  ADMIN_EMAILS が未設定のため admin はいません
                </span>
              )}
            </dd>
          </dl>
        </section>
        <section
          className={clsx(
            "rounded",
            "border",
            "border-gray-200",
            "bg-white",
            "p-4",
            "text-sm",
          )}
        >
          <h2 className={clsx("mb-2", "font-semibold", "text-gray-700")}>
            認証プロバイダ
          </h2>
          <dl
            className={clsx(
              "grid",
              "grid-cols-[auto_1fr]",
              "gap-x-4",
              "gap-y-1",
            )}
          >
            {Object.entries(me.provider).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-gray-500">{k}</dt>
                <dd
                  className={k === "warning" ? "text-amber-700" : "break-all"}
                >
                  {Array.isArray(v) ? v.join(", ") : String(v ?? "-")}
                </dd>
              </div>
            ))}
          </dl>
          <h3
            className={clsx("mt-4", "mb-1", "font-semibold", "text-gray-700")}
          >
            届いている認証ヘッダ
          </h3>
          {me.headersPresent.length === 0 ? (
            <p className="text-gray-500">なし</p>
          ) : (
            <ul className={clsx("list-disc", "pl-5")}>
              {me.headersPresent.map((h) => (
                <li key={h}>
                  <code>{h}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
