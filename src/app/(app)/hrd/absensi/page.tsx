import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="HR"
      title="Attendance"
      permission="hrd.read"
    />
  );
}
