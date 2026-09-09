import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="IT"
      title="Pengguna"
      permission="it.manage_users"
    />
  );
}
