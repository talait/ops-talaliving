import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="IT"
      title="Users"
      permission="it.manage_users"
    />
  );
}
