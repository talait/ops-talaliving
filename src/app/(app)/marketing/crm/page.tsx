import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Marketing"
      title="CRM"
      permission="marketing.read"
    />
  );
}
