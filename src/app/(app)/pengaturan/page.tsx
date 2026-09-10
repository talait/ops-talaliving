import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Settings"
      title="General"
      permission="settings.read"
    />
  );
}
