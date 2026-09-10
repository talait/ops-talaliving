import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      breadcrumb="Projects"
      title="Delivery"
      permission="project.read"
    />
  );
}
