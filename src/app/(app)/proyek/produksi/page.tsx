import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Projects"
      title="Production"
      permission="project.read"
    />
  );
}
