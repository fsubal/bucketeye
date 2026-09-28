import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { devLogin } from "@/api/session";
import { meQueryOptions } from "@/components/Auth";

/** ?redirect= にログイン後に戻る先（認証ガードが付ける）。同じオリジン内のパスだけ受け付ける（オープンリダイレクト対策） */
export const DevLoginSearch = z.object({
  redirect: z
    .string()
    .refine((s) => s.startsWith("/") && !s.startsWith("//"))
    .optional()
    .catch(undefined),
});
export type DevLoginSearch = z.infer<typeof DevLoginSearch>;

export default function DevLogin({ search }: { search: DevLoginSearch }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => devLogin(email, name),
    onSuccess: async () => {
      // 古い身元（未ログインのエラー）を捨ててから戻る。戻り先の beforeLoad が取り直す
      qc.removeQueries({ queryKey: meQueryOptions.queryKey });
      await navigate({ href: search.redirect ?? "/objects", replace: true });
    },
  });

  return (
    <div className="mx-auto mt-10 max-w-md rounded border border-gray-200 bg-white p-6">
      <h1 className="mb-1 text-lg font-semibold">開発用ログイン</h1>
      <p className="mb-4 text-xs text-amber-700">
        誰でも誰にでもなれます。開発・デモ専用です。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="space-y-3"
      >
        <label className="block text-sm">
          <span className="text-gray-700">メールアドレス</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">表示名（任意）</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 p-2"
          />
        </label>
        {m.isError && <p className="text-xs text-red-600">{m.error.message}</p>}
        <button
          type="submit"
          disabled={m.isPending}
          className="w-full rounded bg-gray-800 py-2 text-sm text-white disabled:opacity-50"
        >
          ログイン
        </button>
      </form>
    </div>
  );
}
