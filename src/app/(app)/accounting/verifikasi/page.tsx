import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Accounting"
      title="Purchase Verification"
      permission="accounting.read"
    />
  );
}
