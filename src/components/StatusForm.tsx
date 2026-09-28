import { clsx } from "clsx";
import { useMutation } from "@tanstack/react-query";
import { updateStatus } from "@/api/status";
import {
  REVIEW_STATUS_LABELS,
  type ReviewedObject,
  type ReviewStatus,
} from "@/domains/ReviewedObject/model";
import { formatDateTime } from "@/utils/datetime";
import { StatusBadge } from "./StatusBadge";

const ACTIONS: Array<{ status: ReviewStatus; className: string }> = [
  {
    status: "approved",
    className: "bg-green-600 hover:bg-green-700 text-white",
  },
  {
    status: "changes_requested",
    className: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  { status: "rejected", className: "bg-red-600 hover:bg-red-700 text-white" },
  {
    status: "pending",
    className: "bg-gray-200 hover:bg-gray-300 text-gray-800",
  },
];

export function StatusForm({
  object,
  onChange,
}: {
  object: ReviewedObject;
  /** 変更できたら呼ぶ。読み直しは詳細を取得している親が行う */
  onChange: () => void;
}) {
  const m = useMutation({
    mutationFn: (status: ReviewStatus) => updateStatus(object.key, status),
    onSuccess: onChange,
  });

  return (
    <section
      className={clsx(
        "rounded",
        "border",
        "border-gray-200",
        "bg-white",
        "p-4",
      )}
    >
      <h2 className={clsx("mb-2", "text-sm", "font-semibold", "text-gray-700")}>
        承認ステータス
      </h2>
      <div className={clsx("mb-3", "flex", "items-center", "gap-2", "text-sm")}>
        <StatusBadge status={object.status} />
        {object.reviewer && (
          <span className="text-gray-500">
            {object.reviewer} · {formatDateTime(object.statusUpdatedAt)}
          </span>
        )}
      </div>
      <div className={clsx("flex", "flex-wrap", "gap-2")}>
        {ACTIONS.filter(({ status }) => status !== object.status).map(
          ({ status, className }) => (
            <button
              key={status}
              type="button"
              disabled={m.isPending}
              onClick={() => m.mutate(status)}
              className={clsx(
                "rounded",
                "px-3",
                "py-1.5",
                "text-sm",
                "disabled:opacity-50",
                className,
              )}
            >
              {REVIEW_STATUS_LABELS[status]}
            </button>
          ),
        )}
      </div>
      {m.isError && (
        <p className={clsx("mt-2", "text-xs", "text-red-600")}>
          {m.error.message}
        </p>
      )}
    </section>
  );
}
