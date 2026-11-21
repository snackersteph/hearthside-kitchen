import { useState } from "react";
import { toast } from "sonner";
import type { Vendor } from "@/lib/kitchen/types";
import { useKitchen } from "@/lib/kitchen/store";
import { validVendor, vendorDirectory, vendorMatches } from "@/lib/kitchen/vendors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function VendorEditor({ vendor, onClose }: { vendor?: Vendor; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const [draft, setDraft] = useState<Vendor>(vendor ?? { id: crypto.randomUUID(), name: "", aliases: [], contactName: "", email: "", phone: "", website: "", address: "", notes: "" });
  const [error, setError] = useState("");
  const fields = [{ key: "name", label: "Vendor name", type: "text" }, { key: "contactName", label: "Contact person", type: "text" }, { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone", type: "tel" }, { key: "website", label: "Website / app URL", type: "url" }] as const;
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{vendor ? "Edit vendor" : "Add vendor"}</DialogTitle><DialogDescription>{vendor ? vendor.name : "Contact information"}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    const trimmed = { ...draft, email: draft.email.trim(), website: draft.website.trim() };
    if (!validVendor(trimmed)) { setError("Enter a vendor name, a valid email, and a full http:// or https:// website address when provided."); return; }
    if (vendorDirectory(state, true).some((v) => v.id !== draft.id && vendorMatches(v, draft.name))) { setError("A vendor with this name already exists."); return; }
    dispatch({ type: "saveVendor", vendor: trimmed }); toast.success("Vendor saved"); onClose();
  }}><div className="grid gap-4 sm:grid-cols-2">{fields.map(({ key, label, type }) => <div key={key} className={key === "name" ? "space-y-2 sm:col-span-2" : "space-y-2"}><Label htmlFor={`vendor-${key}`}>{label}{key === "name" ? " *" : ""}</Label><Input id={`vendor-${key}`} type={type} required={key === "name"} maxLength={key === "name" ? 100 : 500} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></div>)}</div><div className="space-y-2"><Label htmlFor="vendor-address">Address</Label><Textarea id="vendor-address" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="vendor-notes">Notes</Label><Textarea id="vendor-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save vendor</Button></div></form></DialogContent></Dialog>;
}