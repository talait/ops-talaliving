import { Construction } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";

/** Isi sementara untuk halaman yang rutenya sudah ada tapi modulnya belum
 *  dibangun.
 *
 *  Sengaja jujur menyebut dirinya belum jadi, dan menyebutkan izin apa yang
 *  menjaganya. Halaman kosong yang tampak "hampir jadi" membuat orang mengira
 *  fiturnya rusak; halaman yang mengaku belum dibangun tidak menimbulkan
 *  laporan bug palsu.
 */
export function ModulePlaceholder({
  breadcrumb,
  title,
  description,
  permission,
}: {
  breadcrumb: string;
  title: string;
  description?: string;
  permission?: string;
}) {
  return (
    <div>
      <PageHeader breadcrumb={breadcrumb} title={title} description={description} />
      <Card>
        <CardHeader title="Not built yet" subtitle="The route and navigation exist; the module follows." icon={Construction} />
        <div className="space-y-3 px-5 py-6 text-sm text-slate-600">
          <p>
            This page is part of the shell. Structure, navigation, permissions and components
            are in place; the data model and the workflow are not.
          </p>
          {permission && (
            <p className="text-xs text-slate-500">
              Guarded by <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{permission}</code>.
              A role without it does not see the menu entry at all — try switching role, top right.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
