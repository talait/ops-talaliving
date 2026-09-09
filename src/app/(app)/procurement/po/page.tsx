import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Procurement"
      title="Purchase Order"
      permission="procurement.read"
    />
  );
}
