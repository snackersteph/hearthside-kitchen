import { toast } from "sonner";
import { useKitchen } from "@/lib/kitchen/store";
import { dishById } from "@/lib/kitchen/data";
import { canApproveMeal } from "@/lib/kitchen/schedule";
import type { SubstitutionProposal } from "@/lib/kitchen/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function RememberApprovalDialog({ p, onClose }: { p: SubstitutionProposal; onClose: () => void }) {
  const { dispatch } = useKitchen();
  const late = !p.serviceDate || !canApproveMeal(p.serviceDate);
  function approve(remember: boolean) {
    if (!p.serviceDate || !canApproveMeal(p.serviceDate)) { toast.error("The approval deadline has passed"); onClose(); return; }
    dispatch({ type: "approveSub", proposalId: p.id, meal: p.meal, dishId: p.dishId, residentIds: p.residentIds, serviceDate: p.serviceDate, modified: true, remember, summary: `Approved ${p.serviceDate} ${p.meal} alternative: ${dishById(p.dishId).name}` });
    toast.success(remember ? "Approved — future matching meals will auto-approve" : "Approved for this date only");
    onClose();
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Save this choice for the future?</DialogTitle>
        <DialogDescription>Automatically approve {dishById(p.dishId).name} for these residents whenever the same main dish returns. If their allergies, diet or texture requirements change, or this dish becomes unsafe, a new staff approval is required.</DialogDescription>
      </DialogHeader>
      <div className="text-sm font-medium">Serve date: {p.serviceDate}</div>
      {late && <p className="text-sm text-destructive">Approval was due {p.approvalDueDate}. This date can no longer be approved.</p>}
      <DialogFooter>
        {late ? <Button variant="outline" onClick={onClose}>Close</Button> : <>
          <Button variant="outline" onClick={() => approve(false)}>This date only</Button>
          <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={() => approve(true)}>Save for future</Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}