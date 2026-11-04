-- ═══════════ Estudio: plan de carrera ═══════════
alter table public.materias
  add column if not exists anio int check (anio between 1 and 8),
  add column if not exists tope_faltas numeric(5,1) check (tope_faltas>=0),
  add column if not exists nota_objetivo numeric(4,2) check (nota_objetivo between 0 and 10);

create function public.soy_dueno_materia(m bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from materias where id=m and perfil_id=auth.uid())
$$;
revoke all on function public.soy_dueno_materia(bigint) from public, anon;
grant execute on function public.soy_dueno_materia(bigint) to authenticated;

create table public.materia_correlativas (
  materia_id bigint not null references public.materias(id) on delete cascade,
  requiere_id bigint not null references public.materias(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  primary key (materia_id, requiere_id),
  check (materia_id<>requiere_id)
);
create index materia_correlativas_perfil_idx on public.materia_correlativas(perfil_id);
alter table public.materia_correlativas enable row level security;
create policy "míos" on public.materia_correlativas for all to authenticated
  using (perfil_id=auth.uid())
  with check (perfil_id=auth.uid() and public.soy_dueno_materia(materia_id) and public.soy_dueno_materia(requiere_id));

-- Foco: una fila por sesión; perfil+inicio evita guardar dos veces la misma
create table public.sesiones_foco (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  materia_id bigint references public.materias(id) on delete set null,
  inicio timestamptz not null,
  minutos int not null check (minutos between 1 and 240),
  creado_en timestamptz not null default now(),
  unique (perfil_id, inicio)
);
alter table public.sesiones_foco enable row level security;
create policy "míos" on public.sesiones_foco for all to authenticated
  using (perfil_id=auth.uid())
  with check (perfil_id=auth.uid() and (materia_id is null or public.soy_dueno_materia(materia_id)));

-- Tarjetas de repaso
create table public.mazos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  materia_id bigint references public.materias(id) on delete set null,
  nombre text not null check (length(trim(nombre))>0),
  creado_en timestamptz not null default now()
);
create index mazos_perfil_idx on public.mazos(perfil_id);
alter table public.mazos enable row level security;
create policy "míos" on public.mazos for all to authenticated
  using (perfil_id=auth.uid())
  with check (perfil_id=auth.uid() and (materia_id is null or public.soy_dueno_materia(materia_id)));

create function public.soy_dueno_mazo(m bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from mazos where id=m and perfil_id=auth.uid())
$$;
revoke all on function public.soy_dueno_mazo(bigint) from public, anon;
grant execute on function public.soy_dueno_mazo(bigint) to authenticated;

create table public.tarjetas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  mazo_id bigint not null references public.mazos(id) on delete cascade,
  pregunta text not null check (length(trim(pregunta))>0),
  respuesta text not null check (length(trim(respuesta))>0),
  facilidad numeric(4,2) not null default 2.5 check (facilidad>=1.3),
  intervalo int not null default 0 check (intervalo>=0),
  repeticiones int not null default 0 check (repeticiones>=0),
  vence date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  creado_en timestamptz not null default now()
);
create index tarjetas_mazo_idx on public.tarjetas(mazo_id, vence);
create index tarjetas_perfil_idx on public.tarjetas(perfil_id, vence);
alter table public.tarjetas enable row level security;
create policy "míos" on public.tarjetas for all to authenticated
  using (perfil_id=auth.uid())
  with check (perfil_id=auth.uid() and public.soy_dueno_mazo(mazo_id));

-- Faltas
create table public.faltas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  materia_id bigint not null references public.materias(id) on delete cascade,
  fecha date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  cantidad numeric(3,1) not null default 1 check (cantidad in (0.5,1)),
  creado_en timestamptz not null default now()
);
create index faltas_perfil_idx on public.faltas(perfil_id, materia_id);
create index faltas_materia_idx on public.faltas(materia_id);
alter table public.faltas enable row level security;
create policy "míos" on public.faltas for all to authenticated
  using (perfil_id=auth.uid())
  with check (perfil_id=auth.uid() and public.soy_dueno_materia(materia_id));

-- Parciales, TPs y otras notas
create table public.calificaciones (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  materia_id bigint not null references public.materias(id) on delete cascade,
  tipo text not null default 'parcial' check (tipo in ('parcial','tp','final','otro')),
  titulo text,
  nota numeric(4,2) not null check (nota between 0 and 10),
  peso numeric(5,2) not null default 1 check (peso>0),
  fecha date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  creado_en timestamptz not null default now()
);
create index calificaciones_perfil_idx on public.calificaciones(perfil_id, materia_id);
create index calificaciones_materia_idx on public.calificaciones(materia_id);
alter table public.calificaciones enable row level security;
create policy "míos" on public.calificaciones for all to authenticated
  using (perfil_id=auth.uid())
  with check (perfil_id=auth.uid() and public.soy_dueno_materia(materia_id));

-- ═══════════ Tareas ═══════════
create table public.tarea_listas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  nombre text not null check (length(trim(nombre))>0),
  emoji text not null default '📋',
  creado_en timestamptz not null default now()
);
create index tarea_listas_perfil_idx on public.tarea_listas(perfil_id);
alter table public.tarea_listas enable row level security;

create table public.tarea_lista_miembros (
  lista_id bigint not null references public.tarea_listas(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (lista_id, perfil_id)
);
create index tarea_lista_miembros_perfil_idx on public.tarea_lista_miembros(perfil_id);
alter table public.tarea_lista_miembros enable row level security;

create function public.soy_dueno_lista(l bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from tarea_listas where id=l and perfil_id=auth.uid())
$$;
create function public.soy_miembro_lista(l bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from tarea_lista_miembros where lista_id=l and perfil_id=auth.uid())
$$;
revoke all on function public.soy_dueno_lista(bigint), public.soy_miembro_lista(bigint) from public, anon;
grant execute on function public.soy_dueno_lista(bigint), public.soy_miembro_lista(bigint) to authenticated;

create policy "veo las mías y las compartidas" on public.tarea_listas for select to authenticated
  using (perfil_id=auth.uid() or public.soy_miembro_lista(id));
create policy "creo las mías" on public.tarea_listas for insert to authenticated
  with check (perfil_id=auth.uid() and grupo_id=public.mi_grupo());
create policy "edito las mías" on public.tarea_listas for update to authenticated
  using (perfil_id=auth.uid()) with check (perfil_id=auth.uid() and grupo_id=public.mi_grupo());
create policy "borro las mías" on public.tarea_listas for delete to authenticated
  using (perfil_id=auth.uid());

create policy "ven dueño y miembros" on public.tarea_lista_miembros for select to authenticated
  using (perfil_id=auth.uid() or public.soy_dueno_lista(lista_id) or public.soy_miembro_lista(lista_id));
create policy "comparte el dueño con su grupo" on public.tarea_lista_miembros for insert to authenticated
  with check (public.soy_dueno_lista(lista_id) and perfil_id<>auth.uid() and public.puedo_invitar(perfil_id));
create policy "saca el dueño o se va" on public.tarea_lista_miembros for delete to authenticated
  using (perfil_id=auth.uid() or public.soy_dueno_lista(lista_id));

create table public.tareas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  lista_id bigint references public.tarea_listas(id) on delete cascade,  -- null: mis tareas sueltas
  evento_id bigint references public.eventos(id) on delete set null,     -- copia en la Agenda
  titulo text not null check (length(trim(titulo))>0),
  notas text,
  fecha date,
  prioridad text not null default 'media' check (prioridad in ('baja','media','alta')),
  pasos jsonb not null default '[]',
  repetir text not null default 'no' check (repetir in ('no','semanal')),
  veces_hecha int not null default 0,
  hecha boolean not null default false,
  hecha_en timestamptz,
  hecha_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  check (repetir='no' or fecha is not null)
);
create index tareas_perfil_idx on public.tareas(perfil_id, hecha);
create index tareas_lista_idx on public.tareas(lista_id, hecha);
create index tareas_evento_idx on public.tareas(evento_id);
alter table public.tareas enable row level security;

create policy "veo las mías y las de mis listas" on public.tareas for select to authenticated
  using ((lista_id is null and perfil_id=auth.uid()) or public.soy_dueno_lista(lista_id) or public.soy_miembro_lista(lista_id));
create policy "sumo tareas" on public.tareas for insert to authenticated
  with check (perfil_id=auth.uid()
    and (lista_id is null or public.soy_dueno_lista(lista_id) or public.soy_miembro_lista(lista_id))
    and (evento_id is null or public.soy_dueno_evento(evento_id)));
create policy "edito tareas" on public.tareas for update to authenticated
  using ((lista_id is null and perfil_id=auth.uid()) or public.soy_dueno_lista(lista_id) or public.soy_miembro_lista(lista_id))
  with check ((lista_id is null and perfil_id=auth.uid()) or public.soy_dueno_lista(lista_id) or public.soy_miembro_lista(lista_id));
create policy "borro tareas" on public.tareas for delete to authenticated
  using ((lista_id is null and perfil_id=auth.uid()) or public.soy_dueno_lista(lista_id) or public.soy_miembro_lista(lista_id));

-- Antes de guardar: el autor no cambia, solo él toca el vínculo con su Agenda,
-- y una tarea semanal hecha salta a la semana siguiente en vez de cerrarse.
create function public.tarea_antes_de_guardar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  new.perfil_id := old.perfil_id;
  if auth.uid() is distinct from old.perfil_id then new.evento_id := old.evento_id; end if;
  if new.hecha and not old.hecha then
    if new.repetir='semanal' then
      new.hecha := false;
      new.fecha := new.fecha + 7*greatest(1,ceil((hoy-new.fecha+1)/7.0)::int);
      new.pasos := (select coalesce(jsonb_agg(p||'{"h":false}'::jsonb),'[]'::jsonb) from jsonb_array_elements(new.pasos) p);
      new.veces_hecha := old.veces_hecha+1;
    else
      new.hecha_en := now();
      new.hecha_por := auth.uid();
    end if;
  elsif not new.hecha then
    new.hecha_en := null;
    new.hecha_por := null;
  end if;
  return new;
end $$;
create trigger tarea_cuidar before update on public.tareas for each row execute function public.tarea_antes_de_guardar();

-- La copia en la Agenda sigue a la tarea
create function public.tarea_a_agenda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op='DELETE' then
    delete from eventos where id=old.evento_id and perfil_id=old.perfil_id;
    return old;
  end if;
  if new.evento_id is null then return new; end if;
  if new.fecha is null then
    delete from eventos where id=new.evento_id and perfil_id=new.perfil_id;
  else
    update eventos set titulo=new.titulo, fecha=new.fecha::timestamp at time zone 'America/Argentina/Buenos_Aires', hecho=new.hecha
    where id=new.evento_id and perfil_id=new.perfil_id;
  end if;
  return new;
end $$;
create trigger tarea_agenda after update of titulo, fecha, hecha or delete on public.tareas for each row execute function public.tarea_a_agenda();

create function public.al_compartir_lista() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare l tarea_listas; quien text;
begin
  select * into l from tarea_listas where id=new.lista_id;
  select nombre into quien from perfiles where id=l.perfil_id;
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  values (new.perfil_id,'tareas',quien||' compartió una lista con vos',l.nombre,'/tareas?lista='||l.id);
  return new;
end $$;
create trigger lista_compartida after insert on public.tarea_lista_miembros for each row execute function public.al_compartir_lista();
revoke all on function public.tarea_antes_de_guardar(), public.tarea_a_agenda(), public.al_compartir_lista() from public, anon, authenticated;

-- ═══════════ Mi caja ═══════════
create table public.caja_categorias (
  id bigint generated always as identity primary key,
  perfil_id uuid references public.perfiles(id) on delete cascade,  -- null: para todos
  nombre text not null check (length(trim(nombre))>0),
  emoji text not null default '🗂️',
  orden int not null default 100
);
create unique index caja_categorias_unica on public.caja_categorias(coalesce(perfil_id,'00000000-0000-0000-0000-000000000000'), nombre);
alter table public.caja_categorias enable row level security;
create policy "veo las comunes y las mías" on public.caja_categorias for select to authenticated using (perfil_id is null or perfil_id=auth.uid());
create policy "sumo las mías" on public.caja_categorias for insert to authenticated with check (perfil_id=auth.uid());
create policy "edito las mías" on public.caja_categorias for update to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "borro las mías" on public.caja_categorias for delete to authenticated using (perfil_id=auth.uid());

insert into public.caja_categorias(nombre,emoji,orden) values
 ('Documentos','🪪',1),('Facu','📚',2),('Casa','🏠',3),('Salud','💊',4),('Transporte','🚌',5),('Ideas','💡',6),('Otros','🗂️',7);

create table public.caja_items (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null default 'nota' check (tipo in ('nota','enlace','foto','archivo')),
  titulo text not null check (length(trim(titulo))>0),
  cuerpo text,
  enlace text check (enlace is null or enlace ~* '^https?://'),
  archivo text,
  archivo_nombre text,
  mime text,
  categoria text not null default 'Otros',
  fijado boolean not null default false,
  clave text,  -- para encontrar datos especiales, como la SUBE
  creado_en timestamptz not null default now(),
  check (archivo is null or split_part(archivo,'/',1)=perfil_id::text),
  unique (perfil_id, clave)
);
create index caja_items_perfil_idx on public.caja_items(perfil_id, fijado desc, creado_en desc);
alter table public.caja_items enable row level security;
create policy "míos" on public.caja_items for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

-- ═══════════ Compras ═══════════
create table public.compra_listas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  nombre text not null check (length(trim(nombre))>0),
  compartida boolean not null default false,
  creado_en timestamptz not null default now()
);
create index compra_listas_perfil_idx on public.compra_listas(perfil_id);
create index compra_listas_grupo_idx on public.compra_listas(grupo_id) where compartida;
alter table public.compra_listas enable row level security;
create policy "veo las mías y las del grupo" on public.compra_listas for select to authenticated
  using (perfil_id=auth.uid() or (compartida and grupo_id=public.mi_grupo()));
create policy "creo las mías" on public.compra_listas for insert to authenticated
  with check (perfil_id=auth.uid() and grupo_id=public.mi_grupo());
create policy "edito las mías" on public.compra_listas for update to authenticated
  using (perfil_id=auth.uid()) with check (perfil_id=auth.uid() and grupo_id=public.mi_grupo());
create policy "borro las mías" on public.compra_listas for delete to authenticated
  using (perfil_id=auth.uid());

create function public.puedo_ver_compra(l bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from compra_listas c where c.id=l and (c.perfil_id=auth.uid() or (c.compartida and c.grupo_id=public.mi_grupo())))
$$;
revoke all on function public.puedo_ver_compra(bigint) from public, anon;
grant execute on function public.puedo_ver_compra(bigint) to authenticated;

create table public.compra_items (
  id bigint generated always as identity primary key,
  lista_id bigint not null references public.compra_listas(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null check (length(trim(nombre))>0),
  cantidad numeric(10,2) not null default 1 check (cantidad>0),
  precio numeric(14,2) check (precio>=0),
  tildado boolean not null default false,
  creado_en timestamptz not null default now()
);
create index compra_items_lista_idx on public.compra_items(lista_id);
create index compra_items_perfil_idx on public.compra_items(perfil_id);
alter table public.compra_items enable row level security;
create policy "veo los de mis listas" on public.compra_items for select to authenticated using (public.puedo_ver_compra(lista_id));
create policy "sumo a mis listas" on public.compra_items for insert to authenticated with check (perfil_id=auth.uid() and public.puedo_ver_compra(lista_id));
create policy "edito los de mis listas" on public.compra_items for update to authenticated using (public.puedo_ver_compra(lista_id)) with check (public.puedo_ver_compra(lista_id));
create policy "borro los de mis listas" on public.compra_items for delete to authenticated using (public.puedo_ver_compra(lista_id));

create function public.conservar_autor() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.perfil_id := old.perfil_id;
  return new;
end $$;
create trigger compra_item_autor before update on public.compra_items for each row execute function public.conservar_autor();
revoke all on function public.conservar_autor() from public, anon, authenticated;

-- Lo tildado pasa a la Billetera de quien toca el botón y sale de la lista,
-- así no se puede anotar dos veces. Corre con los permisos del usuario.
create function public.pasar_a_billetera(p_lista bigint, p_monto numeric default null) returns numeric
language plpgsql security invoker set search_path = public, pg_temp as $$
declare nom text; total numeric; n int;
begin
  select nombre into nom from compra_listas where id=p_lista;
  if nom is null then raise exception 'lista no encontrada'; end if;
  perform 1 from compra_items where lista_id=p_lista and tildado for update;
  get diagnostics n = row_count;
  if n=0 then raise exception 'no hay nada tildado'; end if;
  select coalesce(sum(cantidad*precio),0) into total from compra_items where lista_id=p_lista and tildado;
  total := round(coalesce(p_monto,total),2);
  if total<=0 then raise exception 'falta el monto'; end if;
  insert into movimientos(perfil_id,tipo,monto,categoria,nota) values (auth.uid(),'gasto',total,'Súper',nom);
  delete from compra_items where lista_id=p_lista and tildado;
  return total;
end $$;
revoke all on function public.pasar_a_billetera(bigint,numeric) from public, anon;
grant execute on function public.pasar_a_billetera(bigint,numeric) to authenticated;

-- ═══════════ Tarifas de transporte ═══════════
-- Solo lectura desde la app: los precios se actualizan con una migración.
create table public.tarifas (
  id bigint generated always as identity primary key,
  modo text not null unique,
  nombre text not null,
  emoji text not null default '🚌',
  desde numeric(10,2) not null check (desde>0),
  hasta numeric(10,2) check (hasta>=desde),
  detalle text,
  escalones jsonb not null default '[]',  -- descuentos por viajes del mes
  fuente text not null,
  fuente_url text check (fuente_url is null or fuente_url ~* '^https?://'),
  revisada date not null,
  para_confirmar boolean not null default false,
  orden int not null default 100
);
alter table public.tarifas enable row level security;
create policy "lee quien entró" on public.tarifas for select to authenticated using (true);
revoke all on public.tarifas from anon;
revoke insert, update, delete, truncate on public.tarifas from authenticated;

insert into public.tarifas(modo,nombre,emoji,desde,hasta,detalle,escalones,fuente,fuente_url,revisada,para_confirmar,orden) values
 ('subte','Subte','🚇',1888,null,'Noviembre 2026, primeros 20 viajes del mes con SUBE registrada. Después baja: 20% del viaje 21 al 30, 30% del 31 al 40 y 40% desde el 41.',
  '[{"desde_viaje":21,"descuento":20},{"desde_viaje":31,"descuento":30},{"desde_viaje":41,"descuento":40}]',
  'La Nación, 31/10/2026','https://www.lanacion.com.ar/economia/aumenta-el-transporte-publico-como-queda-el-boleto-de-colectivos-y-subte-a-partir-del-1-de-noviembre-nid31102026/','2026-11-04',false,1),
 ('colectivo_caba','Colectivo de la Ciudad','🚌',956.38,1226.48,'Noviembre 2026 con SUBE registrada. Desde $956,38 hasta 3 km, hasta $1.226,48 de 12 a 27 km.','[]',
  'La Nación, 31/10/2026','https://www.lanacion.com.ar/economia/aumenta-el-transporte-publico-como-queda-el-boleto-de-colectivos-y-subte-a-partir-del-1-de-noviembre-nid31102026/','2026-11-04',false,2),
 ('colectivo_nacional','Colectivo nacional','🚍',742.81,null,'Precio desde, hasta 3 km con SUBE registrada. Sube según la distancia.','[]',
  'Argentina.gob.ar, tarifas de transporte del AMBA','https://www.argentina.gob.ar/redsube/tarifas-de-transporte-publico-amba','2026-11-04',false,3),
 ('colectivo_provincia','Colectivo de la provincia','🚐',1263.69,null,'Precio desde, hasta 3 km con SUBE registrada. Sube según la distancia. Las fuentes publican valores distintos para noviembre.','[]',
  'Prensa, noviembre 2026','https://www.lanacion.com.ar/economia/aumenta-el-transporte-publico-como-queda-el-boleto-de-colectivos-y-subte-a-partir-del-1-de-noviembre-nid31102026/','2026-11-04',true,4),
 ('tren','Tren','🚆',450,790,'Según la sección del viaje, con SUBE registrada.','[]',
  'Argentina.gob.ar, tarifas de transporte del AMBA','https://www.argentina.gob.ar/redsube/tarifas-de-transporte-publico-amba','2026-11-04',false,5);
