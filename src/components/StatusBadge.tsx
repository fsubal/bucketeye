import clsx from "clsx";
import {
  REVIEW_STATUS_LABELS,
  type ReviewStatus,
} from "@/domains/ReviewedObject/model";

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={clsx(
        "inline-block",
        "rounded",
        "px-2",
        "py-0.5",
        "text-xs",
        "font-medium",
        status === "pending" && ["bg-gray-100", "text-gray-700"],
        status === "approved" && ["bg-green-100", "text-green-800"],
        status === "changes_requested" && ["bg-amber-100", "text-amber-800"],
        status === "rejected" && ["bg-red-100", "text-red-800"],
      )}
    >
      {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}
