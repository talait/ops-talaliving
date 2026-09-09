import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Produksi"
      title="Bill of Materials"
      permission="production.read"
    />
  );
}
