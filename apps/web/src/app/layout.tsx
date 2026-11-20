import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@avs/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Video Studio",
  description: "Turn a story into a professional video.",
  manifest: "/manifest.webmanifest",
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
      <body>{children}</body>
    </html>
  );
}
