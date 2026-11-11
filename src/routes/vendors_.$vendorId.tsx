import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, PackageCheck, Truck } from "lucide-react";
import { useKitchen } from "@/lib/kitchen/store";
import { PageHeader } from "@/components/kitchen/app-shell";
import { StandingTag, DocumentTag, dateLabel } from "@/components/kitchen/vendor-badges";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  findVendor,
  orderTotal,
  receivedTotals,
  suppliedItems,
  vendorOrders,
  vendorStanding,
} from "@/lib/kitchen/vendor-views";
import type { PurchaseOrder } from "@/lib/kitchen/types";

export const Route = createFileRoute("/vendors_/$vendorId")({
  head: ({ params }) => ({
    meta: [
      { title: `Vendor ${params.vendorId} · NutriSync` },
      {
        name: "description",
        content: `License, certifications, supplied items and orders for vendor ${params.vendorId}.`,
      },
      { property: "og:title", content: `Vendor ${params.vendorId} · NutriSync` },
      {
        property: "og:description",
        content: `License, certifications, supplied items and orders for vendor ${params.vendorId}.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VendorDetailPage,
});

const money = (n: number) => `$${n.toFixed(2)}`;

function VendorDetailPage() {
  const { vendorId } = Route.useParams();
  const { state } = useKitchen();
  const entry = findVendor(state, vendorId);
  const back = (
    <Button asChild variant="ghost" className="mb-6">
      <Link to="/vendors">
        <ArrowLeft />
        All vendors
      </Link>
    </Button>
  );
  const view = useMemo(() => {
    if (!entry) return null;
    const reference = new Date();
    return {
      standing: vendorStanding(entry.vendor, reference),
      items: suppliedItems(entry.vendor, state, reference),
      orders: vendorOrders(entry.vendor, state),
    };
  }, [entry, state]);
  if (!entry || !view) {
    return (
      <>
        {back}
        <PageHeader eyebrow="Vendors" title="Vendor not found" />
      </>
    );
  }
  const { vendor } = entry;
  const { standing, items, orders } = view;
  const received = receivedTotals(orders.received, state);

  return (
    <>
      {back}
      <PageHeader
        eyebrow={`Vendor · ${vendor.licenseNumber ? `License ${vendor.licenseNumber}` : "No license on file"}`}
        title={vendor.name}
      >
        <StandingTag status={standing.status} />
      </PageHeader>

      {standing.status === "blocked" && (
        <div className="mb-6 border-l-4 border-destructive bg-danger-soft p-4 text-sm">
          <div className="font-semibold text-destructive">Blocked</div>
          <ul className="mt-1 list-disc pl-5">
            {standing.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="mt-2 text-muted-foreground">
            The Inventory Agent will not order the affected items from this vendor until this is
            fixed, however cheap they are.
          </div>
        </div>
      )}
      {standing.status === "unverified" && (
        <div className="mb-6 border-l-4 border-warning bg-warning-soft p-4 text-sm">
          <div className="font-semibold">Unverified</div>
          <ul className="mt-1 list-disc pl-5">
            {standing.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="mt-2 text-muted-foreground">
            The Inventory Agent can't confirm these, so it will not order the affected items until
            staff verify them.
          </div>
        </div>
      )}
      {standing.warnings.length > 0 && (
        <div className="mb-6 border-l-4 border-warning bg-warning-soft p-4 text-sm">
          <div className="font-semibold">Renew soon</div>
          <ul className="mt-1 list-disc pl-5">
            {standing.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {vendor.notes && <p className="mb-6 text-sm text-muted-foreground">{vendor.notes}</p>}

      <div className="space-y-8">
        <section className="border-t pt-6" aria-label="Contact and address">
          <h2 className="mb-4 font-display text-xl font-semibold">Contact & address</h2>
          {vendor.contact || vendor.address ? (
            <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2 2xl:grid-cols-4">
              {vendor.contact && (
                <>
                  <div className="min-w-0">
                    <dt className="mb-1 text-sm text-muted-foreground">Contact person</dt>
                    <dd className="text-sm leading-relaxed">
                      {vendor.contact.name}
                      <span className="block text-muted-foreground">{vendor.contact.role}</span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="mb-1 text-sm text-muted-foreground">Phone</dt>
                    <dd className="text-sm leading-relaxed">
                      <a
                        href={`tel:${vendor.contact.phone.replace(/[^\d+]/g, "")}`}
                        className="underline underline-offset-4"
                      >
                        {vendor.contact.phone}
                      </a>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="mb-1 text-sm text-muted-foreground">Email</dt>
                    <dd className="break-words text-sm leading-relaxed">
                      <a
                        href={`mailto:${vendor.contact.email}`}
                        className="underline underline-offset-4"
                      >
                        {vendor.contact.email}
                      </a>
                    </dd>
                  </div>
                </>
              )}
              {vendor.address && (
                <div className="min-w-0">
                  <dt className="mb-1 text-sm text-muted-foreground">Address</dt>
                  <dd className="text-sm leading-relaxed">
                    {vendor.address.street}
                    <span className="block">
                      {vendor.address.city}, {vendor.address.region} {vendor.address.postalCode}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="border-y py-5 text-sm text-muted-foreground">
              No contact details or address on file for this vendor.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Fictional sample data. Phone numbers and emails are placeholders.
          </p>
        </section>

        <section className="border-t pt-6" aria-label="License and certifications">
          <h2 className="mb-4 font-display text-xl font-semibold">License & certifications</h2>
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  {["Document", "Issuer", "Expires", "Status"].map((h) => (
                    <TableHead key={h} className="px-3 py-3 font-bold text-foreground">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="px-3 py-3 font-medium">
                    Business license{standing.license.number ? ` · ${standing.license.number}` : ""}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-muted-foreground">
                    State licensing (sample)
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    {standing.license.expires ? dateLabel(standing.license.expires) : "—"}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <DocumentTag
                      state={standing.license.state}
                      daysLeft={standing.license.daysLeft}
                    />
                  </TableCell>
                </TableRow>
                {standing.certifications.map((c) => (
                  <TableRow key={c.kind}>
                    <TableCell className="px-3 py-3 font-medium">{c.label} certification</TableCell>
                    <TableCell className="px-3 py-3 text-muted-foreground">{c.issuer}</TableCell>
                    <TableCell className="px-3 py-3">{dateLabel(c.expires)}</TableCell>
                    <TableCell className="px-3 py-3">
                      <DocumentTag state={c.state} daysLeft={c.daysLeft} />
                    </TableCell>
                  </TableRow>
                ))}
                {!standing.certifications.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                      No certifications on file.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Fictional sample data. No real registry is contacted.
          </p>
        </section>

        <section className="border-t pt-6" aria-label="What we get from this vendor">
          <h2 className="mb-1 font-display text-xl font-semibold">
            What we get from {vendor.name}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Prices and lead times the Inventory Agent compares when something runs short.
          </p>
          {!items.length ? (
            <p className="border-y py-6 text-center text-muted-foreground">
              No items are assigned to this vendor.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table className="min-w-[760px]">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {[
                      "Ingredient",
                      "Price",
                      "Lead time",
                      "In stock",
                      "On order",
                      "Role",
                      "Can we order it?",
                    ].map((h) => (
                      <TableHead key={h} className="px-3 py-3 font-bold text-foreground">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.ingredient.id}>
                      <TableCell className="px-3 py-3 font-medium">
                        {item.ingredient.name}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        {money(item.unitCost)} / {item.ingredient.unit}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        {item.leadTimeDays} day{item.leadTimeDays === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        {Math.round(item.ingredient.stock * 100) / 100} {item.ingredient.unit}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        {item.ingredient.onOrder
                          ? `${Math.round(item.ingredient.onOrder * 100) / 100} ${item.ingredient.unit}`
                          : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-muted-foreground">
                        {item.source === "default" ? "Usual vendor" : "Backup supplier"}
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <span className="inline-flex flex-col items-start gap-1">
                          <StandingTag status={item.compliance.status} />
                          {item.compliance.reasons[0] && (
                            <span className="text-xs text-muted-foreground">
                              {item.compliance.reasons.join("; ")}
                            </span>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="border-t pt-6" aria-label="Orders">
          <h2 className="mb-4 font-display text-xl font-semibold">Orders</h2>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" />
            Incoming ({orders.incoming.length})
          </h3>
          <OrderList orders={orders.incoming} empty="No incoming orders from this vendor." />
          <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold">
            <PackageCheck className="h-4 w-4" />
            Received so far ({orders.received.length})
          </h3>
          {received.length > 0 && (
            <div className="mb-3 overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {["Ingredient", "Total received", "Spend"].map((h) => (
                      <TableHead key={h} className="px-3 py-3 font-bold text-foreground">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {received.map((total) => (
                    <TableRow key={total.ingredientId}>
                      <TableCell className="px-3 py-3 font-medium">{total.name}</TableCell>
                      <TableCell className="px-3 py-3">
                        {total.qty} {total.unit}
                      </TableCell>
                      <TableCell className="px-3 py-3">{money(total.spend)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <OrderList orders={orders.received} empty="Nothing received from this vendor yet." />
          <p className="mt-4 text-sm">
            <Link
              to="/inventory"
              search={{ view: "incoming" }}
              className="font-medium underline underline-offset-4"
            >
              Manage orders in Inventory
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}

function OrderList({ orders, empty }: { orders: PurchaseOrder[]; empty: string }) {
  const { state } = useKitchen();
  if (!orders.length) return <p className="border-y py-5 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y border-y">
      {orders.map((order) => (
        <div key={order.id} className="flex flex-wrap items-center gap-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {order.status === "received" ? "Delivered" : "Expected"}{" "}
              {dateLabel(order.deliveryDate)}
              <span className="ml-2 font-normal text-muted-foreground">
                {money(orderTotal(order, state))}
              </span>
            </div>
            <div className="mt-1 text-muted-foreground">
              {order.lines
                .map((line) => {
                  const ingredient = state.ingredients.find((i) => i.id === line.ingredientId);
                  return `${ingredient?.name ?? line.ingredientId} · ${line.qty} ${ingredient?.unit ?? ""}`.trim();
                })
                .join(" / ")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
