import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Pengaturan"
      title="Umum"
      permission="settings.read"
    />
  );
}
