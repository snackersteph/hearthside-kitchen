import type { RoomPlan } from "./agent-room";
import { MANAGEMENT_APPROVAL_THRESHOLD } from "./agent-room";

/**
 * Who may do what in the Agent Room. One pure function, so the web app and any other front end
 * (for example a Telegram bot) enforce exactly the same rules. The check belongs on the server
 * side of every action; the UI only mirrors it to disable buttons and explain why.
 */

export type RoomRole = "chef" | "caregiver" | "management";
export const ROOM_ROLES: RoomRole[] = ["chef", "caregiver", "management"];

export const ROLE_LABEL: Record<RoomRole, string> = {
  chef: "Chef",
  caregiver: "Caregiver",
  management: "Management",
};

export type RoomAction = "view" | "request-plan" | "approve-plan" | "send-to-management";

export interface Permission {
  allowed: boolean;
  /** Why it is not allowed, in words a user can act on. */
  reason?: string;
}

const yes: Permission = { allowed: true };
const no = (reason: string): Permission => ({ allowed: false, reason });

export function can(role: RoomRole, action: RoomAction, plan?: RoomPlan): Permission {
  switch (action) {
    case "view":
      return yes;
    case "request-plan":
      return role === "caregiver"
        ? no("Caregivers can follow the agents but can't ask for plans.")
        : yes;
    case "approve-plan": {
      if (role === "caregiver") return no("Caregivers can't approve plans.");
      if (plan && !plan.ready)
        return no("This plan still has unresolved items, so it can't be approved yet.");
      if (role === "chef" && plan?.approver === "management")
        return no(
          `The order is over $${MANAGEMENT_APPROVAL_THRESHOLD}, so Management must approve it.`,
        );
      return yes;
    }
    case "send-to-management": {
      if (role !== "chef") return no("Only the Chef sends plans to Management.");
      if (plan && !plan.ready) return no("Resolve the open items before sending this on.");
      if (plan && plan.approver !== "management")
        return no("This plan is within the Chef's limit, so Management isn't needed.");
      return yes;
    }
  }
}
