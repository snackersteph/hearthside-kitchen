import { describe, expect, it } from "vitest";
import { approvalHistory } from "@/lib/kitchen/approval-history";
import type { Decision } from "@/lib/kitchen/types";

const reference = new Date("2026-11-19T07:15:00Z");
const decision = (id: string, at: string, serviceWeekId = "week-2026-11-23"): Decision => ({ proposalId: id, kind: "purchase", status: "approved", at: Date.parse(at), summary: `Approved ${id} order`, modified: false, serviceWeekId });
const records = [decision("recent", "2026-11-18T12:00:00Z"), decision("older", "2026-11-08T12:00:00Z", "week-2026-11-16"), decision("october", "2026-10-24T12:00:00Z"), decision("future", "2026-11-20T12:00:00Z")];

describe("approval history decision-time ranges", () => {
  it("past week includes recent approvals for future service weeks, not older approvals for last week", () => {
    expect(approvalHistory(records, 7, reference).map((d) => d.proposalId)).toEqual(["recent"]);
  });
  it("past two weeks includes decisions from the last 14 days", () => {
    expect(approvalHistory(records, 14, reference).map((d) => d.proposalId)).toEqual(["recent", "older"]);
  });
  it("past month includes decisions from the last 30 days", () => {
    expect(approvalHistory(records, 30, reference).map((d) => d.proposalId)).toEqual(["recent", "older", "october"]);
  });
  it("all time includes older decisions without including future timestamps", () => {
    expect(approvalHistory([decision("old", "2026-09-01T00:00:00Z"), ...records], "all", reference).map((d) => d.proposalId)).toEqual(["recent", "older", "october", "old"]);
  });
  it("retains separate meal/order and search filters", () => {
    const meal: Decision = { ...records[0], proposalId: "meal", kind: "substitution", at: reference.getTime(), status: "rejected", summary: "Rejected breakfast", modified: false };
    expect(approvalHistory([...records, meal], 7, reference, "substitution").map((d) => d.proposalId)).toEqual(["meal"]);
    expect(approvalHistory(records, 30, reference, "purchase", "october").map((d) => d.proposalId)).toEqual(["october"]);
  });
});