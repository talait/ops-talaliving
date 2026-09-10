import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Production"
      title="Planning & Schedule"
      permission="production.schedule"
    />
  );
}
