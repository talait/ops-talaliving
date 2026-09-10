import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/store/session";
import { ToastProvider } from "@/store/toast";
import { Toaster } from "@/components/ui/toaster";
import { BRAND } from "@/lib/brand";
import { DemoProvider } from "@/demo/provider";

export const metadata: Metadata = {
  title: BRAND.documentTitle,
  description: "Sistem manajemen internal manufaktur furnitur.",
};

export const viewport: Viewport = {
  themeColor: "#2f6b52",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <DemoProvider>
          <SessionProvider>
            <ToastProvider>
              {children}
              <Toaster />
            </ToastProvider>
          </SessionProvider>
        </DemoProvider>
      </body>
    </html>
  );
}
