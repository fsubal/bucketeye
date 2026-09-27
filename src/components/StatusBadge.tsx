import {
  REVIEW_STATUS_LABELS,
  type ReviewStatus,
} from "@/domains/ReviewedObject/model";

const STYLES: Record<ReviewStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  approved: "bg-green-100 text-green-800",
  changes_requested: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}
