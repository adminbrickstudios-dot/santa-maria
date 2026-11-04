"use client";
import { Sesion } from "@/lib/sesion";
import { Marco } from "@/components/Marco";
export default function L({ children }: { children: React.ReactNode }) {
  return <Sesion><Marco>{children}</Marco></Sesion>;
}
