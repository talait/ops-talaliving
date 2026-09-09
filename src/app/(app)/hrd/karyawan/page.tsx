import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="HRD"
      title="Data Karyawan"
      permission="hrd.read"
    />
  );
}
