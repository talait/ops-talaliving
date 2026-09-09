import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Accounting"
      title="Arus Kas"
      permission="accounting.read"
    />
  );
}
