import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Procurement"
      title="Suppliers"
      permission="procurement.read"
    />
  );
}
