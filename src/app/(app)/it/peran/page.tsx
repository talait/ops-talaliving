import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="IT"
      title="Roles & Permissions"
      permission="it.manage_roles"
    />
  );
}
