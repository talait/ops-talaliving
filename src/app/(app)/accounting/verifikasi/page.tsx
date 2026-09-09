import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Accounting"
      title="Verifikasi Pembelian"
      permission="accounting.read"
    />
  );
}
