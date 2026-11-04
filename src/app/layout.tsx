import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Intro } from "@/components/Intro";

export const metadata: Metadata = {
  title: "Santa María",
  description: "Tu vida en Buenos Aires organizada: cómo llegar, facu, guía de la ciudad y tu gente.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/iconos/192.png", apple: "/iconos/apple.png" },
  appleWebApp: { capable: true, title: "Santa María", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#15181C", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function Raiz({ children }: { children: React.ReactNode }) {
  return <html lang="es-AR"><body><Intro />{children}</body></html>;
}
