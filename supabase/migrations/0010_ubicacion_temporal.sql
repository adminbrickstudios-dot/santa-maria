-- ═══════════ Ir hasta una persona: ubicación compartida a propósito y por poco tiempo ═══════════
-- La fila la crea cada persona desde su celular y vence sola. Sin fila, nadie ve nada.
-- Sin aplicar todavía: revisar antes de llevarla a producción.
create table public.ubicaciones_temporales (
  perfil_id uuid primary key references public.perfiles(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  hasta timestamptz not null,
  actualizado timestamptz not null default now(),
  check (hasta <= now() + interval '2 hours')
);
create index ubicaciones_temporales_grupo_idx on public.ubicaciones_temporales(grupo_id, hasta);
alter table public.ubicaciones_temporales enable row level security;

-- Se ve solo dentro del grupo, y solo mientras no venció
create policy "el grupo ve lo vigente" on public.ubicaciones_temporales for select to authenticated
  using (grupo_id = public.mi_grupo() and hasta > now());
create policy "crea la propia" on public.ubicaciones_temporales for insert to authenticated
  with check (perfil_id = auth.uid() and grupo_id = public.mi_grupo());
create policy "cambia la propia" on public.ubicaciones_temporales for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and grupo_id = public.mi_grupo());
create policy "borra la propia" on public.ubicaciones_temporales for delete to authenticated
  using (perfil_id = auth.uid());
