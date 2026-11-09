import { toast } from "sonner";
import { useKitchen } from "@/lib/kitchen/store";
import { dishById } from "@/lib/kitchen/data";
import { canApproveMeal } from "@/lib/kitchen/schedule";
import type { SubstitutionProposal } from "@/lib/kitchen/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function RememberApprovalDialog({ p, onClose }: { p: SubstitutionProposal; onClose: () => void }) {
  const { dispatch } = useKitchen();
  function approve(remember: boolean) {
    if (!p.serviceDate || !canApproveMeal(p.serviceDate)) { toast.error("The approval deadline has passed"); onClose(); return; }
    dispatch({ type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: true, remember, summary: `Approved ${p.serviceDate} ${p.meal} alternative: ${dishById(p.dishId).name}` });
    toast.success(remember ? "Approved and remembered for future reviews" : "Approved for this date only");
    onClose();
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Save this choice for the future?</DialogTitle>
        <DialogDescription>{dishById(p.dishId).name} for these residents whenever the same main dish returns. Future choices will still need approval and dietary checks.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => approve(false)}>This date only</Button>
        <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={() => approve(true)}>Save for future</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}