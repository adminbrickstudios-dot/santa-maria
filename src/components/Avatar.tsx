import { iniciales } from "@/lib/util";

export function Avatar({ p, t = 44 }: { p: { nombre?: string; color?: string; avatar_url?: string | null } | null; t?: number }) {
  const n = p?.nombre || "?";
  if (p?.avatar_url) return <img className="avatar" src={p.avatar_url} alt="" style={{ width: t, height: t, objectFit: "cover" }} />;
  return <span className="avatar" style={{ width: t, height: t, background: p?.color || "#555", fontSize: t * 0.38 }}>{iniciales(n)}</span>;
}
