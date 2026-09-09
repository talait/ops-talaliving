import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Procurement"
      title="Receiving Report"
      permission="procurement.read"
    />
  );
}
