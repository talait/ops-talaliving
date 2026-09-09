import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Accounting"
      title="Buku Besar"
      permission="accounting.read"
    />
  );
}
