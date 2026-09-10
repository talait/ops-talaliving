import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Inventory"
      title="Logs"
      permission="inventory.read"
    />
  );
}
