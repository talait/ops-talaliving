import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Accounting"
      title="Payslips"
      permission="payroll.read"
    />
  );
}
