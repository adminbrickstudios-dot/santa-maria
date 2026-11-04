-- ═══════════ Mapa: listas propias y ubicación en vivo ═══════════
-- Los lugares guardados ya tienen tabla (favoritos, 0001). Esto suma lo que faltaba.
-- Hasta que se aplique, las listas quedan en perfiles.preferencias y "Compartir ubicación" no aparece.

-- Listas de lugares de cada persona. Solo las ve su dueño.
create table public.mapa_listas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 60),
  lugares jsonb not null default '[]' check (jsonb_typeof(lugares)='array' and jsonb_array_length(lugares)<=200),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index mapa_listas_perfil_idx on public.mapa_listas(perfil_id);
alter table public.mapa_listas enable row level security;
create policy "míos" on public.mapa_listas for all to authenticated
  using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

-- Ubicación en vivo. No existe la fila si la persona no eligió compartir:
-- una fila por persona, con la lista de quiénes la ven y hasta cuándo.
create table public.ubicaciones_vivas (
  perfil_id uuid primary key references public.perfiles(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  rumbo smallint check (rumbo between 0 and 360),
  para uuid[] not null check (cardinality(para) between 1 and 50),
  hasta timestamptz not null,
  actualizado_en timestamptz not null default now(),
  check (not (perfil_id = any(para)))
);
create index ubicaciones_vivas_grupo_idx on public.ubicaciones_vivas(grupo_id, hasta);
alter table public.ubicaciones_vivas enable row level security;
-- La ve quien la comparte, y las personas elegidas del mismo grupo mientras no venció,
-- salvo que el dueño las haya bloqueado.
create policy "lee la mía o la que me comparten" on public.ubicaciones_vivas for select to authenticated
  using (
    perfil_id=auth.uid()
    or (grupo_id=public.mi_grupo() and auth.uid()=any(para) and hasta>now()
        and not exists(select 1 from public.bloqueos b where b.perfil_id=ubicaciones_vivas.perfil_id and b.bloqueado_id=auth.uid()))
  );
-- Nunca más de tres horas por vez: la app ofrece 15 minutos, 1 hora o 3 horas.
create policy "comparte como yo" on public.ubicaciones_vivas for insert to authenticated
  with check (perfil_id=auth.uid() and grupo_id=public.mi_grupo() and hasta<=now()+interval '3 hours 5 minutes');
create policy "actualiza la mía" on public.ubicaciones_vivas for update to authenticated
  using (perfil_id=auth.uid())
  with check (perfil_id=auth.uid() and grupo_id=public.mi_grupo() and hasta<=now()+interval '3 hours 5 minutes');
create policy "borra la mía" on public.ubicaciones_vivas for delete to authenticated
  using (perfil_id=auth.uid());

-- Si alguien cierra la app sin parar, su última posición no queda guardada para siempre:
-- cada escritura borra las vencidas. Necesita definer porque RLS no deja borrar filas ajenas.
create function public.limpiar_ubicaciones_vencidas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.ubicaciones_vivas where hasta<now();
  return null;
end $$;
revoke all on function public.limpiar_ubicaciones_vencidas() from public, anon, authenticated;
create trigger ubicaciones_vivas_limpiar after insert or update on public.ubicaciones_vivas
  for each statement execute function public.limpiar_ubicaciones_vencidas();
