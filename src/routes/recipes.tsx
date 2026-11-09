import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Plus, Search, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { MEAL_LABEL, Tag } from "@/components/kitchen/agents";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ALLERGENS, MEALS, type Allergen, type Meal } from "@/lib/kitchen/types";
import { DISH_CATEGORIES, recipeAvailability, recipeCategory, type DishCategory, DIET_GROUPS, TEXTURES, isValidRecipe, recipeLibrary, recipeNutrition, unitsFor, type DietGroup, type Recipe, type RecipeIngredient, type Texture } from "@/lib/kitchen/recipes";

export const Route = createFileRoute("/recipes")({
  head: () => ({
    meta: [
      { title: "Recipes · NutriSync" },
      { name: "description", content: "Browse kitchen recipes by meal, diet group and texture, with allergens, sodium and nutrition per serving." },
      { property: "og:title", content: "Recipes · NutriSync" },
      { property: "og:description", content: "Recipe library with ingredients, allergens, halal status, sodium and nutrition." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecipesPage,
});

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function RecipesPage() {
  const { state, dispatch } = useKitchen();
  const [query, setQuery] = useState("");
  const [meal, setMeal] = useState<"all" | Meal>("all");
  const [diet, setDiet] = useState<"all" | DietGroup>("all");
  const [texture, setTexture] = useState<"all" | Texture>("all");
  const [category, setCategory] = useState<"all" | DishCategory>("all");
  const [editing, setEditing] = useState<Recipe | null>(null);
  const servings = state.residents.length;
  const [open, setOpen] = useState<Recipe | null>(null);
  const [deleting, setDeleting] = useState<Recipe | null>(null);
  const [adding, setAdding] = useState(false);
  const all = recipeLibrary(state);
  const q = query.trim().toLowerCase();
  const rows = all.filter((r) => (meal === "all" || r.meal === meal) && (diet === "all" || r.dietGroup === diet) && (texture === "all" || r.texture === texture) && (category === "all" || recipeCategory(r) === category)
    && (!q || r.name.toLowerCase().includes(q) || r.ingredients.some((l) => state.ingredients.find((i) => i.id === l.id)?.name.toLowerCase().includes(q))))
    .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader eyebrow="Kitchen library" title={`${all.length} Recipes`}>
        <div className="flex flex-wrap gap-2">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search recipes" placeholder="Search recipes or ingredients" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64 pl-9" /></div>
          <Button onClick={() => setAdding(true)}><Plus />Add recipe</Button>
        </div>
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-3 border-b pb-5">
        <Filter label="Meal" value={meal} onChange={setMeal} options={MEALS} />
        <Filter label="Category" value={category} onChange={setCategory} options={DISH_CATEGORIES} />
        <Filter label="Diet group" value={diet} onChange={setDiet} options={DIET_GROUPS} />
        <Filter label="Texture" value={texture} onChange={setTexture} options={TEXTURES} />
        {(meal !== "all" || category !== "all" || diet !== "all" || texture !== "all" || q) && <Button variant="ghost" className="self-end" onClick={() => { setMeal("all"); setCategory("all"); setDiet("all"); setTexture("all"); setQuery(""); }}><X />Clear</Button>}
      </div>

      {rows.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No recipes match these filters.</div> :
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <button key={r.id} onClick={() => setOpen(r)} className={cn("rounded-xl border p-5 text-left shadow-sm transition-shadow hover:shadow-md", `bg-meal-${r.meal}`)}>
              <div className="flex items-start justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{MEAL_LABEL[r.meal]} · {recipeCategory(r)}</div><StockBadge recipe={r} servings={servings} compact /></div>
              <div className="mt-1 text-lg font-semibold leading-snug">{r.name}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Tag>{r.dietGroup}</Tag><Tag>{r.texture} texture</Tag>
                {r.allergens.map((a) => <Tag key={a} tone="danger">{a}</Tag>)}
              </div>
            </button>
          ))}
        </div>}

      <RecipeDetail recipe={open} servings={servings} onClose={() => setOpen(null)} onDelete={(r) => setDeleting(r)} onEdit={(r) => { setOpen(null); setEditing(r); }} />
      <AddRecipeDialog key={editing?.id ?? "new"} open={!!editing} initial={editing ?? undefined} onClose={() => setEditing(null)} onSave={(r) => { dispatch({ type: "editRecipe", recipe: r }); toast.success(`${r.name} updated`); setEditing(null); }} existing={all.filter((x) => x.id !== editing?.id)} />
      <AddRecipeDialog open={adding} onClose={() => setAdding(false)} onSave={(r) => { dispatch({ type: "addRecipe", recipe: r }); toast.success(`${r.name} added`); setAdding(false); }} existing={all} />
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>This removes the recipe from the library. This can't be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleting) { dispatch({ type: "deleteRecipe", id: deleting.id }); toast.success(`${deleting.name} deleted`); } setDeleting(null); setOpen(null); }}>Delete recipe</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Filter<T extends string>({ label: l, value, onChange, options }: { label: string; value: "all" | T; onChange: (v: "all" | T) => void; options: readonly T[] }) {
  return (
    <label className="text-sm font-medium">{l}
      <Select value={value} onValueChange={(v) => onChange(v as "all" | T)}>
        <SelectTrigger aria-label={l} className="mt-1.5 w-44 bg-background"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">All</SelectItem>{options.map((o) => <SelectItem key={o} value={o}>{label(o)}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  );
}

const STOCK = {
  available: { icon: CheckCircle2, text: "All ingredients in stock", short: "In stock", cls: "bg-success-soft text-success" },
  low: { icon: AlertTriangle, text: "Running low", short: "Running low", cls: "bg-warning-soft text-warning" },
  unavailable: { icon: XCircle, text: "Missing ingredients", short: "Missing", cls: "bg-danger-soft text-destructive" },
} as const;

function StockBadge({ recipe, servings, compact }: { recipe: Recipe; servings: number; compact?: boolean }) {
  const { state } = useKitchen();
  const { status, short } = recipeAvailability(recipe, state.ingredients, servings);
  const m = STOCK[status]; const Icon = m.icon;
  return (
    <div className={cn("shrink-0 rounded-md px-2 py-1 text-xs font-semibold", m.cls, !compact && "w-full px-3 py-2")}>
      <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{compact ? m.short : m.text}</span>
      {!compact && <div className="mt-0.5 font-normal">{status === "available" ? `Enough for ${servings} servings.` : `Short for ${servings} servings: ${short.join(", ")}.`}</div>}
    </div>
  );
}

function RecipeDetail({ recipe, servings, onClose, onDelete, onEdit }: { recipe: Recipe | null; servings: number; onClose: () => void; onDelete: (r: Recipe) => void; onEdit: (r: Recipe) => void }) {
  const { state } = useKitchen();
  const n = recipe ? recipeNutrition(recipe, state.ingredients) : null;
  return (
    <Dialog open={!!recipe} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {recipe && n && <>
          <DialogHeader>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{MEAL_LABEL[recipe.meal]} · {recipeCategory(recipe)}</div>
            <DialogTitle className="text-2xl">{recipe.name}</DialogTitle>
            <DialogDescription asChild><div className="flex flex-wrap gap-1.5 pt-1"><Tag>{recipe.dietGroup}</Tag><Tag>{recipe.texture} texture</Tag></div></DialogDescription>
          </DialogHeader>
          <StockBadge recipe={recipe} servings={servings} />
          <section>
            <h3 className="mb-2 text-sm font-semibold">Ingredients per serving</h3>
            <ul className="divide-y rounded-lg border">
              {recipe.ingredients.map((l) => { const i = state.ingredients.find((x) => x.id === l.id); return (
                <li key={l.id} className="flex justify-between px-3 py-2 text-sm"><span className={cn(!i && "text-destructive")}>{i?.name ?? `${l.id} (not in inventory)`}</span><span className="font-medium tabular-nums">{l.qty} {l.unit}{i && <span className="ml-2 font-normal text-muted-foreground">· {i.stock} {i.unit} in stock</span>}</span></li>
              ); })}
            </ul>
          </section>
          <section className="grid grid-cols-2 gap-4 text-sm">
            <div><h3 className="mb-1.5 font-semibold">Allergens</h3><div className="flex flex-wrap gap-1.5">{recipe.allergens.length ? recipe.allergens.map((a) => <Tag key={a} tone="danger">{a}</Tag>) : <span className="text-muted-foreground">None</span>}</div></div>
            <div><h3 className="mb-1.5 font-semibold">Halal</h3>{recipe.halal ? <Tag tone="ok">Halal</Tag> : <Tag>Not halal</Tag>}</div>
            <div><h3 className="mb-1.5 font-semibold">Sodium</h3><span className={cn("font-medium", recipe.sodiumMg > 800 && "text-destructive")}>{recipe.sodiumMg} mg</span></div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Nutrition per serving <span className="font-normal text-muted-foreground">(estimated)</span></h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              {([["Calories", `${n.calories}`], ["Protein", `${n.protein} g`], ["Carbs", `${n.carbs} g`], ["Fat", `${n.fat} g`]] as const).map(([k, v]) => <div key={k} className="rounded-lg border bg-muted/40 p-2"><div className="text-base font-semibold">{v}</div><div className="text-xs text-muted-foreground">{k}</div></div>)}
            </div>
          </section>
          <DialogFooter className="gap-2"><Button variant="outline" className="text-destructive" onClick={() => onDelete(recipe)}><Trash2 />Delete</Button><Button onClick={() => onEdit(recipe)}><Pencil />Edit</Button></DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  );
}

function AddRecipeDialog({ open, onClose, onSave, existing, initial }: { open: boolean; onClose: () => void; onSave: (r: Recipe) => void; existing: Recipe[]; initial?: Recipe | undefined }) {
  const { state } = useKitchen();
  const blank = initial ? { name: initial.name, meal: initial.meal, category: recipeCategory(initial), dietGroup: initial.dietGroup, texture: initial.texture, allergens: [...initial.allergens], halal: initial.halal, sodium: String(initial.sodiumMg), lines: initial.ingredients.map((l) => ({ ...l })) } : { name: "", meal: "lunch" as Meal, category: "main" as DishCategory, dietGroup: "regular" as DietGroup, texture: "regular" as Texture, allergens: [] as Allergen[], halal: false, sodium: "", lines: [] as RecipeIngredient[] };
  const [f, setF] = useState(blank);
  const [pick, setPick] = useState("");
  const ingredients = [...state.ingredients].sort((a, b) => a.name.localeCompare(b.name));
  const recipe: Recipe = { id: initial?.id ?? `r-${Date.now().toString(36)}`, name: f.name, meal: f.meal, category: f.category, dietGroup: f.dietGroup, texture: f.texture, allergens: f.allergens, halal: f.halal, sodiumMg: f.sodium === "" ? NaN : Number(f.sodium), ingredients: f.lines };
  const duplicate = existing.some((r) => r.name.trim().toLowerCase() === f.name.trim().toLowerCase());
  const valid = isValidRecipe(recipe, state.ingredients) && !duplicate;
  const close = () => { setF(blank); setPick(""); onClose(); };
  const setLine = (idx: number, patch: Partial<RecipeIngredient>) => setF({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, ...patch } : l) });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{initial ? `Edit ${initial.name}` : "Add recipe"}</DialogTitle><DialogDescription>Ingredients come from the Inventory list. Amounts are per serving.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <label className="text-sm font-medium">Name<Input className="mt-1.5" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Chicken & Rice Soup" />{duplicate && f.name.trim() && <span className="mt-1 block text-xs text-destructive">A recipe with this name already exists.</span>}</label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SimpleSelect label="Meal" value={f.meal} options={MEALS} onChange={(v) => setF({ ...f, meal: v })} />
            <SimpleSelect label="Category" value={f.category} options={DISH_CATEGORIES} onChange={(v) => setF({ ...f, category: v })} />
            <SimpleSelect label="Diet group" value={f.dietGroup} options={DIET_GROUPS} onChange={(v) => setF({ ...f, dietGroup: v })} />
            <SimpleSelect label="Texture" value={f.texture} options={TEXTURES} onChange={(v) => setF({ ...f, texture: v })} />
          </div>
          <div className="text-sm font-medium">Allergens
            <div className="mt-1.5 flex flex-wrap gap-1.5">{ALLERGENS.map((a) => { const on = f.allergens.includes(a); return (
              <button type="button" key={a} aria-pressed={on} onClick={() => setF({ ...f, allergens: on ? f.allergens.filter((x) => x !== a) : [...f.allergens, a] })} className={cn("rounded-md border px-2 py-1 text-xs font-semibold capitalize", on ? "border-transparent bg-danger-soft text-destructive" : "bg-background text-muted-foreground")}>{a}</button>
            ); })}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">Sodium (mg per serving)<Input className="mt-1.5" type="number" min={0} value={f.sodium} onChange={(e) => setF({ ...f, sodium: e.target.value })} /></label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-primary" checked={f.halal} onChange={(e) => setF({ ...f, halal: e.target.checked })} />Halal</label>
          </div>
          <div className="text-sm font-medium">Ingredients
            <div className="mt-1.5 space-y-2">
              {f.lines.map((l, idx) => { const i = state.ingredients.find((x) => x.id === l.id)!; return (
                <div key={l.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{i.name}</span>
                  <Input aria-label={`${i.name} amount`} type="number" min={0} step="any" className="w-24" value={Number.isNaN(l.qty) ? "" : l.qty} onChange={(e) => setLine(idx, { qty: e.target.value === "" ? NaN : Number(e.target.value) })} />
                  <Select value={l.unit} onValueChange={(v) => setLine(idx, { unit: v as RecipeIngredient["unit"] })}><SelectTrigger aria-label={`${i.name} unit`} className="w-28"><SelectValue /></SelectTrigger><SelectContent>{unitsFor(i.unit).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${i.name}`} onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== idx) })}><X /></Button>
                </div>
              ); })}
              <Select value={pick} onValueChange={(id) => { const i = state.ingredients.find((x) => x.id === id); if (i) setF({ ...f, lines: [...f.lines, { id, qty: NaN, unit: unitsFor(i.unit)[0]! }] }); setPick(""); }}>
                <SelectTrigger aria-label="Add ingredient from inventory"><SelectValue placeholder="+ Add ingredient from inventory" /></SelectTrigger>
                <SelectContent>{ingredients.filter((i) => !f.lines.some((l) => l.id === i.id)).map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={close}>Cancel</Button><Button disabled={!valid} onClick={() => { onSave(recipe); if (!initial) setF(blank); }}>{initial ? "Save changes" : "Save recipe"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SimpleSelect<T extends string>({ label: l, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <label className="text-sm font-medium">{l}
      <Select value={value} onValueChange={(v) => onChange(v as T)}><SelectTrigger aria-label={l} className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{label(o)}</SelectItem>)}</SelectContent></Select>
    </label>
  );
}
