import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="HRD"
      title="Payroll"
      permission="payroll.read"
    />
  );
}
