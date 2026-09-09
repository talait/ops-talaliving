import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Marketing"
      title="Kampanye"
      permission="marketing.read"
    />
  );
}
