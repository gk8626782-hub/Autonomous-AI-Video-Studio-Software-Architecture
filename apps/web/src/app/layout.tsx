import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@avs/ui/tokens.css";
import "./globals.css";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";
import { I18nProvider } from "../lib/i18n";

export const metadata: Metadata = {
  title: "AI Video Studio",
  description: "Turn a story into a professional video.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0B0F17",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>{children}</I18nProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
