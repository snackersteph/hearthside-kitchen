import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { Tag } from "@/components/kitchen/agents";
import { StandingTag, dateLabel } from "@/components/kitchen/vendor-badges";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CERT_LABEL, listVendors, type DocumentState } from "@/lib/kitchen/vendor-views";

export const Route = createFileRoute("/vendors")({
  head: () => ({
    meta: [
      { title: "Vendors · NutriSync" },
      {
        name: "description",
        content:
          "Approved suppliers with their licenses, certifications, items supplied and orders.",
      },
      { property: "og:title", content: "Vendors · NutriSync" },
      {
        property: "og:description",
        content:
          "Check every supplier's license and certifications before the Inventory Agent orders from them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VendorsPage,
});

const CERT_SUFFIX: Record<DocumentState, string> = {
  valid: "",
  expiring: " · expiring",
  expired: " · expired",
  unverified: " · not verified",
  missing: "",
};

function VendorsPage() {
  const { state } = useKitchen();
  const [query, setQuery] = useState("");
  const all = useMemo(() => listVendors(state, new Date()), [state]);
  const q = query.trim().toLowerCase();
  const vendors = all.filter(
    (v) =>
      !q ||
      `${v.vendor.name} ${v.vendor.licenseNumber ?? ""} ${v.vendor.certifications.map((c) => CERT_LABEL[c.kind]).join(" ")}`
        .toLowerCase()
        .includes(q),
  );
  const verified = all.filter((v) => v.standing.status === "eligible").length;
  const blocked = all.filter((v) => v.standing.status === "blocked");
  const attention = all.length - verified;
  const incoming = all.reduce((sum, v) => sum + v.incomingCount, 0);

  return (
    <>
      <PageHeader eyebrow="Suppliers & compliance" title="Vendors">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search vendors"
            placeholder="Search vendors or certifications"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72 bg-card pl-9"
          />
        </div>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="border-l-2 border-success pl-4">
          <div className="text-xs text-muted-foreground">Verified vendors</div>
          <div className="mt-1 text-2xl font-semibold">
            {verified} of {all.length}
          </div>
        </div>
        <div className="border-l-2 border-destructive pl-4">
          <div className="text-xs text-muted-foreground">Need attention</div>
          <div className="mt-1 text-2xl font-semibold">{attention} vendors</div>
        </div>
        <div className="border-l-2 border-agent-inventory pl-4">
          <div className="text-xs text-muted-foreground">Incoming deliveries</div>
          <div className="mt-1 text-2xl font-semibold">{incoming} orders</div>
        </div>
      </div>

      {blocked.length > 0 && (
        <div className="mb-5 border-l-4 border-destructive bg-danger-soft p-4 text-sm">
          <div className="font-semibold text-destructive">
            {blocked.length} vendor{blocked.length > 1 ? "s are" : " is"} blocked:{" "}
            {blocked.map((v) => v.vendor.name).join(", ")}
          </div>
          <div className="mt-1 text-muted-foreground">
            The Inventory Agent will not order the affected items from blocked or unverified
            vendors, however cheap they are.
          </div>
        </div>
      )}

      <p className="mb-3 text-sm text-muted-foreground">
        {vendors.length === all.length
          ? `${all.length} vendors`
          : `${vendors.length} of ${all.length} vendors`}{" "}
        · sample data
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="min-w-[900px] xl:min-w-0">
          <TableHeader className="bg-muted/50">
            <TableRow>
              {["Vendor", "Status", "License", "Certifications", "Items", "Orders"].map((h) => (
                <TableHead key={h} className="px-3 py-4 text-base font-bold text-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((v) => {
              const cells = [
                <span key="name" className="font-semibold">
                  {v.vendor.name}
                  {!v.registered && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      not in registry
                    </span>
                  )}
                </span>,
                <span key="status" className="inline-flex flex-col items-start gap-1">
                  <StandingTag status={v.standing.status} />
                  {v.standing.reasons[0] && (
                    <span className="text-xs text-muted-foreground">{v.standing.reasons[0]}</span>
                  )}
                </span>,
                <span key="license" className="text-sm">
                  {v.standing.license.number ?? (
                    <span className="text-muted-foreground">None on file</span>
                  )}
                  {v.standing.license.expires && (
                    <span className="block text-xs text-muted-foreground">
                      Expires {dateLabel(v.standing.license.expires)}
                    </span>
                  )}
                </span>,
                <span key="certs" className="flex flex-wrap gap-1">
                  {v.standing.certifications.length ? (
                    v.standing.certifications.map((c) => (
                      <Tag
                        key={c.kind}
                        tone={
                          c.state === "valid" ? "ok" : c.state === "expired" ? "danger" : "warn"
                        }
                      >
                        {c.label}
                        {CERT_SUFFIX[c.state]}
                      </Tag>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">None on file</span>
                  )}
                </span>,
                <span key="items" className="text-sm">
                  {v.itemCount} item{v.itemCount === 1 ? "" : "s"}
                </span>,
                <span key="orders" className="text-sm">
                  {v.incomingCount ? `${v.incomingCount} incoming` : "No open orders"}
                  {v.nextDelivery && (
                    <span className="block text-xs text-muted-foreground">
                      Next {dateLabel(v.nextDelivery)}
                    </span>
                  )}
                </span>,
              ];
              return (
                <TableRow key={v.vendor.id} className="group">
                  {cells.map((cell, i) => (
                    <TableCell key={i} className="p-0 align-middle">
                      <Link
                        to="/vendors/$vendorId"
                        params={{ vendorId: v.vendor.id }}
                        tabIndex={i === 0 ? 0 : -1}
                        className="block p-3"
                      >
                        {cell}
                      </Link>
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {!vendors.length && (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-muted-foreground">
                  No vendors found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Licenses and certifications are fictional sample data for this prototype; no real registry
        is contacted.
      </p>
    </>
  );
}
