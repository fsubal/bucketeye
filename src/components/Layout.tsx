import { clsx } from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { devLogout, getConfig, type Me } from "@/api/session";
import { meQueryOptions } from "./Auth";

export function Layout({
  me,
  children,
}: {
  me: Me | null;
  children: ReactNode;
}) {
  const config = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: Infinity,
    enabled: me !== null,
  });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: devLogout,
    onSuccess: async () => {
      // invalidate だと古い身元がキャッシュに残り、認証ガードを通ってしまうので捨てる
      qc.removeQueries({ queryKey: meQueryOptions.queryKey });
      await navigate({ to: "/dev/login" });
    },
  });

  return (
    <div className="min-h-screen">
      <header className={clsx("border-b", "border-gray-200", "bg-white")}>
        <div
          className={clsx(
            "mx-auto",
            "flex",
            "max-w-6xl",
            "items-center",
            "justify-between",
            "gap-4",
            "px-4",
            "py-3",
          )}
        >
          <div className={clsx("flex", "items-center", "gap-4")}>
            <Link to="/objects" className={clsx("text-lg", "font-semibold")}>
              bucketeye
            </Link>
            {config.data && (
              <span className={clsx("text-sm", "text-gray-500")}>
                s3://{config.data.bucket}/{config.data.targetPrefix}
              </span>
            )}
          </div>
          <nav className={clsx("flex", "items-center", "gap-4", "text-sm")}>
            {me?.identity.role === "admin" && (
              <Link
                to="/webhooks"
                className={clsx("text-gray-700", "hover:underline")}
              >
                Webhook
              </Link>
            )}
            {me && (
              <Link
                to="/whoami"
                className={clsx("text-gray-700", "hover:underline")}
                title={`provider: ${me.identity.provider}`}
              >
                {me.identity.email}
                {me.identity.role === "admin" && (
                  <span
                    className={clsx(
                      "ml-1",
                      "rounded",
                      "bg-gray-800",
                      "px-1.5",
                      "py-0.5",
                      "text-xs",
                      "text-white",
                    )}
                  >
                    admin
                  </span>
                )}
              </Link>
            )}
            {me?.identity.provider === "developer" && (
              <button
                type="button"
                className={clsx("text-gray-500", "hover:underline")}
                onClick={() => logout.mutate()}
              >
                ログアウト
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className={clsx("mx-auto", "max-w-6xl", "px-4", "py-6")}>
        {children}
      </main>
    </div>
  );
}
