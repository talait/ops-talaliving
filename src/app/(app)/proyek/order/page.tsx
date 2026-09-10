import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Projects"
      title="Orders"
      permission="project.read"
    />
  );
}
