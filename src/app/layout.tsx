import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./ios.css";
import { Intro } from "@/components/Intro";
import localFont from "next/font/local";

const txt = localFont({ src: "../../node_modules/@fontsource-variable/sofia-sans/files/sofia-sans-latin-wght-normal.woff2", weight: "100 900", variable: "--f-txt", display: "swap" });
const dis = localFont({ src: "../../node_modules/@fontsource-variable/sofia-sans-extra-condensed/files/sofia-sans-extra-condensed-latin-wght-normal.woff2", weight: "100 900", variable: "--f-dis", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Santa María",
  description: "Tu vida en Buenos Aires organizada: cómo llegar, facu, guía de la ciudad y tu gente.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/iconos/192.png", apple: "/iconos/apple.png" },
  appleWebApp: { capable: true, title: "Santa María", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F2F3F7" }, { media: "(prefers-color-scheme: dark)", color: "#000000" }], width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function Raiz({ children }: { children: React.ReactNode }) {
  return <html lang="es-AR" className={`${txt.variable} ${dis.variable}`}><body><Intro />{children}</body></html>;
}
