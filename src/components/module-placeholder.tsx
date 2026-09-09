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
        <CardHeader title="Belum dibangun" subtitle="Rute dan navigasinya sudah ada; isinya menyusul." icon={Construction} />
        <div className="space-y-3 px-5 py-6 text-sm text-slate-600">
          <p>
            Halaman ini bagian dari kerangka. Struktur, menu, izin, dan komponennya sudah siap —
            yang belum ada adalah model data dan alur kerjanya.
          </p>
          {permission && (
            <p className="text-xs text-slate-500">
              Dijaga izin <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{permission}</code>.
              Peran tanpa izin ini tidak melihat menunya sama sekali — coba ganti peran di kanan atas.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
