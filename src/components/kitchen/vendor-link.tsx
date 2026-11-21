import { Link } from "@tanstack/react-router";
import { useKitchen } from "@/lib/kitchen/store";
import { findVendor, vendorId } from "@/lib/kitchen/vendor-directory";

export function VendorLink({ name, order, source = "approvals", view }: { name: string; order: string; source?: "approvals" | "inventory" | "vendors"; view?: "incoming" | "delivered" | undefined }) {
  const { state } = useKitchen();
  const vendor = findVendor(state, name);
  return <Link to="/vendors/$vendorId" params={{ vendorId: vendor?.id ?? vendorId(name) }} search={{ order, source, ...(view ? { view } : {}) }} className="text-primary underline-offset-4 hover:underline">{vendor?.name ?? name}</Link>;
}