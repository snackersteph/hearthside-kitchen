import { useState } from "react";
import type { Ingredient } from "@/lib/kitchen/types";
import { FOOD_CATEGORIES, ingredientCategory, type FoodCategory } from "@/lib/kitchen/inventory-catalog";
import { useKitchen } from "@/lib/kitchen/store";
import { readResidentImage } from "@/lib/kitchen/resident-image";
import { IngredientPhoto } from "./ingredient-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function IngredientEditDialog({ ingredient, onClose }: { ingredient?: Ingredient; onClose: () => void }) {
  const { state, dispatch } = useKitchen();
  const [draft, setDraft] = useState<Ingredient>(ingredient ?? { id: crypto.randomUUID(), name: "", vendor: "", unit: "kg", stock: 0, onOrder: 0, packSize: 1, unitCost: 0, category: "Vegetables" });
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const duplicate = state.ingredients.some((i) => i.id !== draft.id && i.name.trim().toLowerCase() === draft.name.trim().toLowerCase());
  const set = <K extends keyof Ingredient>(key: K, value: Ingredient[K]) => setDraft((d) => ({ ...d, [key]: value }));
  return <>
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{ingredient ? "Edit ingredient" : "Add ingredient"}</DialogTitle><DialogDescription>{ingredient?.name ?? "New inventory item"}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!duplicate && !loading) setConfirming(true); }}>
          <div className="flex items-center gap-4"><IngredientPhoto ingredient={draft} /><label className="min-w-0 text-sm font-medium">Photo<Input aria-label="Ingredient photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setLoading(true); setError(""); try { set("photoUrl", await readResidentImage(file)); } catch (error) { setError(error instanceof Error ? error.message : "Unable to read photo"); } finally { setLoading(false); } }} /></label></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <label className="block text-sm font-medium">Ingredient name<Input required aria-label="Ingredient name" value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
          {duplicate && <p role="alert" className="text-sm text-destructive">This ingredient already exists.</p>}
          <label className="block text-sm font-medium">Section<Select value={ingredientCategory(draft)} onValueChange={(v) => set("category", v as FoodCategory)}><SelectTrigger aria-label="Ingredient section"><SelectValue /></SelectTrigger><SelectContent>{FOOD_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">Unit<Select value={draft.unit} disabled={Boolean(ingredient)} onValueChange={(v) => set("unit", v)}><SelectTrigger aria-label="Ingredient unit"><SelectValue /></SelectTrigger><SelectContent>{[...new Set(["kg", "L", "each", ...(ingredient ? [ingredient.unit] : [])])].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-sm font-medium">In stock ({draft.unit})<Input required aria-label="In stock" type="number" min={0} step="any" value={draft.stock} onChange={(e) => set("stock", Number(e.target.value))} /></label>
            <label className="text-sm font-medium">Order pack size<Input required aria-label="Order pack size" type="number" min={0.001} step="any" value={draft.packSize} onChange={(e) => set("packSize", Number(e.target.value))} /></label>
            <label className="text-sm font-medium">Cost per {draft.unit} ($)<Input required aria-label="Unit cost" type="number" min={0} step="any" value={draft.unitCost} onChange={(e) => set("unitCost", Number(e.target.value))} /></label>
          </div>
          <label className="block text-sm font-medium">Vendor<Input required aria-label="Vendor" value={draft.vendor} onChange={(e) => set("vendor", e.target.value)} /></label>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={duplicate || loading || !draft.name.trim() || !draft.vendor.trim()}>{ingredient ? "Save changes" : "Add ingredient"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirming} onOpenChange={setConfirming}><AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg"><AlertDialogHeader><AlertDialogTitle>{ingredient ? `Save changes to ${draft.name}?` : `Add ${draft.name}?`}</AlertDialogTitle><AlertDialogDescription>{draft.stock} {draft.unit} in stock · {ingredientCategory(draft)} · {draft.vendor}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button onClick={() => { dispatch({ type: ingredient ? "updateIngredient" : "addIngredient", ingredient: draft }); toast.success(ingredient ? "Ingredient updated" : "Ingredient added"); onClose(); }}>Confirm save</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}