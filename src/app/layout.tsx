import "./globals.css";
import type { Metadata, Viewport } from "next";
import AuthGate from "@/components/AuthGate";

export const metadata: Metadata = { title: "Phòng khám mắt" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
