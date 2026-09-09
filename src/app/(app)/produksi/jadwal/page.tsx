import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Produksi"
      title="Rencana & Jadwal"
      permission="production.schedule"
    />
  );
}
