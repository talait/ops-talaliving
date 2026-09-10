import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Inventory"
      title="Stock Adjustments"
      permission="inventory.adjust"
    />
  );
}
