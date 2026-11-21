import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search, Store, ArrowUpRight } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { vendorDirectory, vendorPurchases, vendorMatches } from "@/lib/kitchen/vendor-directory";
import { PageHeader } from "@/components/kitchen/app-shell";
import { VendorEditor } from "@/components/kitchen/vendor-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/vendors")({
  head: () => ({ meta: [{ title: "Vendors · NutriSync" }, { name: "description", content: "Manage kitchen suppliers, contact details and related purchase orders." }, { property: "og:title", content: "Vendors · NutriSync" }, { property: "og:description", content: "Kitchen vendor contacts and purchase orders in one place." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: VendorsPage,
});
function VendorsPage() {
  const { state, reference } = useKitchen();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const vendors = vendorDirectory(state).filter((v) => [v.name, ...v.aliases, v.contactName, v.email, v.phone, v.address].join(" ").toLowerCase().includes(query.toLowerCase()));
  const orders = vendorPurchases(state, reference);
  return <><PageHeader title="Vendors"><Button onClick={() => setAdding(true)}><Plus />Add vendor</Button></PageHeader><div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5"><span className="text-sm text-muted-foreground">{vendors.length} vendors</span><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="w-full pl-9 sm:w-80" placeholder="Search vendors or contacts" aria-label="Search vendors" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{vendors.map((v) => <Link key={v.id} to="/vendors/$vendorId" params={{ vendorId: v.id }} className="group flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5 transition-colors hover:border-primary"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Store className="h-5 w-5 shrink-0 text-primary" /><h2 className="break-words font-display text-xl font-semibold">{v.name}</h2></div><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" /></div><div className="space-y-1 break-words text-sm text-muted-foreground"><p>{v.contactName || "Contact person not added"}</p><p>{v.email || v.phone || "Contact details not added"}</p></div><p className="mt-auto border-t pt-3 text-sm font-medium">{orders.filter((o) => vendorMatches(v, o.proposal.vendor)).length} orders</p></Link>)}</div>{!vendors.length && <p className="border-y py-12 text-center text-muted-foreground">{query ? "No matching vendors." : "No vendors yet."}</p>}{adding && <VendorEditor onClose={() => setAdding(false)} />}</>;
}