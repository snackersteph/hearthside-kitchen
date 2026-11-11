import { Tag } from "@/components/kitchen/agents";
import type { ComplianceStatus } from "@/lib/kitchen/vendor-engine";
import type { DocumentState } from "@/lib/kitchen/vendor-views";

export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** Overall or per-item compliance: Verified / Unverified / Blocked. */
export function StandingTag({ status }: { status: ComplianceStatus }) {
  if (status === "eligible") return <Tag tone="ok">Verified</Tag>;
  if (status === "unverified") return <Tag tone="warn">Unverified</Tag>;
  return <Tag tone="danger">Blocked</Tag>;
}

export function documentText(state: DocumentState, daysLeft?: number): string {
  switch (state) {
    case "valid":
      return "Valid";
    case "expiring":
      return `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
    case "expired":
      return "Expired";
    case "unverified":
      return "Not verified";
    case "missing":
      return "None on file";
  }
}

export function DocumentTag({
  state,
  daysLeft,
}: {
  state: DocumentState;
  daysLeft?: number | undefined;
}) {
  const tone = state === "valid" ? "ok" : state === "expired" ? "danger" : "warn";
  return <Tag tone={tone}>{documentText(state, daysLeft)}</Tag>;
}
