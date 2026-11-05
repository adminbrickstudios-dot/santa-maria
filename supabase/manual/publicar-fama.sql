-- FAMA: pegar todo esto en Supabase > SQL Editor y tocar Run.
-- Va entero o no va: si algo falla, no queda nada aplicado.
begin;
set local lock_timeout = '10s';

-- ═══════════════ 0012_rls_rapida ═══════════════
-- RLS rápida: cada política calcula quién sos UNA vez por consulta, no una vez por fila.
-- No cambia quién ve qué: solo cómo se evalúa. Las políticas se reescriben con ALTER POLICY,
-- así nunca hay un momento sin regla. Toma un lock breve por tabla; si algo tarda más de 5 s,
-- la migración falla entera y se puede repetir.

-- Listas que antes se preguntaban fila por fila con una función.
-- Con (select f()) en la política, Postgres la corre una sola vez por consulta.
create function public.mis_eventos_invitado() returns bigint[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(evento_id),'{}') from evento_invitados where perfil_id=auth.uid()
$$;
create function public.mis_listas() returns bigint[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(l),'{}') from (
    select id l from tarea_listas where perfil_id=auth.uid()
    union select lista_id from tarea_lista_miembros where perfil_id=auth.uid()) x
$$;
create function public.mis_listas_compra() returns bigint[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(id),'{}') from compra_listas
  where perfil_id=auth.uid() or (compartida and grupo_id=public.mi_grupo())
$$;
create function public.mis_conversaciones_ids() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(conversacion_id),'{}') from conversacion_miembros where perfil_id=auth.uid()
$$;
revoke all on function public.mis_eventos_invitado(), public.mis_listas(), public.mis_listas_compra(), public.mis_conversaciones_ids() from public, anon;
grant execute on function public.mis_eventos_invitado(), public.mis_listas(), public.mis_listas_compra(), public.mis_conversaciones_ids() to authenticated;

-- Dos políticas FOR ALL se sumaban a la de lectura y se evaluaban dos veces al leer.
drop policy "respondo yo" on public.juntada_respuestas;
create policy "respondo yo" on public.juntada_respuestas for insert to authenticated
  with check (perfil_id = (select auth.uid()) and exists(select 1 from public.juntadas j where j.id = juntada_id and j.grupo_id = (select public.mi_grupo())));
create policy "cambio mi respuesta" on public.juntada_respuestas for update to authenticated
  using (perfil_id = (select auth.uid()))
  with check (perfil_id = (select auth.uid()) and exists(select 1 from public.juntadas j where j.id = juntada_id and j.grupo_id = (select public.mi_grupo())));
create policy "saco mi respuesta" on public.juntada_respuestas for delete to authenticated
  using (perfil_id = (select auth.uid()));

drop policy "edito las mías" on public.plata_categorias;
create policy "sumo las mías" on public.plata_categorias for insert to authenticated with check (perfil_id = (select auth.uid()));
create policy "edito las mías" on public.plata_categorias for update to authenticated using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));
create policy "borro las mías" on public.plata_categorias for delete to authenticated using (perfil_id = (select auth.uid()));

-- Tiempo real: nadie escucha esta tabla y se decodificaba igual.
do $$ begin
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='juntada_respuestas') then
    alter publication supabase_realtime drop table public.juntada_respuestas;
  end if;
end $$;

-- Advertencias de seguridad del panel de Supabase
alter function public.frase_faltan(int) set search_path = public, pg_temp;
alter function public.pesos_txt(numeric) set search_path = public, pg_temp;

-- ───── Políticas: auth.uid(), mi_grupo() y soy_admin() envueltas en (select ...) ─────
alter policy "borra el autor o admin" on public.aportes
  using (((grupo_id = (select public.mi_grupo())) AND ((autor_id = (select auth.uid())) OR (select public.soy_admin()))));
alter policy "lee mi grupo" on public.aportes
  using ((grupo_id = (select public.mi_grupo())));
alter policy "suma como yo" on public.aportes
  with check (((grupo_id = (select public.mi_grupo())) AND (autor_id = (select auth.uid()))));
alter policy "borra el autor o admin" on public.apuntes
  using (((grupo_id = (select public.mi_grupo())) AND ((autor_id = (select auth.uid())) OR (select public.soy_admin()))));
alter policy "lee mi grupo" on public.apuntes
  using ((grupo_id = (select public.mi_grupo())));
alter policy "suma como yo" on public.apuntes
  with check (((grupo_id = (select public.mi_grupo())) AND (autor_id = (select auth.uid()))));
alter policy "míos" on public.bloqueos
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "borro las mías" on public.caja_categorias
  using ((perfil_id = (select auth.uid())));
alter policy "edito las mías" on public.caja_categorias
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "sumo las mías" on public.caja_categorias
  with check ((perfil_id = (select auth.uid())));
alter policy "veo las comunes y las mías" on public.caja_categorias
  using (((perfil_id IS NULL) OR (perfil_id = (select auth.uid()))));
alter policy "míos" on public.caja_items
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "míos" on public.calendario_enlaces
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "míos" on public.calendarios_externos
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "míos" on public.calificaciones
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND public.soy_dueno_materia(materia_id)));
alter policy "míos" on public.clases
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "borro los de mis listas" on public.compra_items
  using (lista_id = any((select public.mis_listas_compra())::bigint[]));
alter policy "edito los de mis listas" on public.compra_items
  using (lista_id = any((select public.mis_listas_compra())::bigint[]))
  with check (lista_id = any((select public.mis_listas_compra())::bigint[]));
alter policy "sumo a mis listas" on public.compra_items
  with check (((perfil_id = (select auth.uid())) AND public.puedo_ver_compra(lista_id)));
alter policy "veo los de mis listas" on public.compra_items
  using (lista_id = any((select public.mis_listas_compra())::bigint[]));
alter policy "borro las mías" on public.compra_listas
  using ((perfil_id = (select auth.uid())));
alter policy "creo las mías" on public.compra_listas
  with check (((perfil_id = (select auth.uid())) AND (grupo_id = (select public.mi_grupo()))));
alter policy "edito las mías" on public.compra_listas
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND (grupo_id = (select public.mi_grupo()))));
alter policy "veo las mías y las del grupo" on public.compra_listas
  using (((perfil_id = (select auth.uid())) OR (compartida AND (grupo_id = (select public.mi_grupo())))));
alter policy "edito mi fila" on public.conversacion_miembros
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "veo mis filas" on public.conversacion_miembros
  using (perfil_id = (select auth.uid()) or conversacion_id = any((select public.mis_conversaciones_ids())::uuid[]));
alter policy "solo miembros" on public.conversaciones
  using (id = any((select public.mis_conversaciones_ids())::uuid[]));
alter policy "borran los miembros" on public.cuenta_gastos
  using ((EXISTS ( SELECT 1 FROM cuentas c WHERE ((c.id = cuenta_gastos.cuenta_id) AND ((select auth.uid()) = ANY (c.miembros))))));
alter policy "suman los miembros" on public.cuenta_gastos
  with check ((EXISTS ( SELECT 1 FROM cuentas c WHERE ((c.id = cuenta_gastos.cuenta_id) AND ((select auth.uid()) = ANY (c.miembros)) AND (cuenta_gastos.pago_id = ANY (c.miembros))))));
alter policy "ven los miembros" on public.cuenta_gastos
  using ((EXISTS ( SELECT 1 FROM cuentas c WHERE ((c.id = cuenta_gastos.cuenta_id) AND ((select auth.uid()) = ANY (c.miembros))))));
alter policy "crea" on public.cuentas
  with check (((grupo_id = (select public.mi_grupo())) AND (creada_por = (select auth.uid())) AND ((select auth.uid()) = ANY (miembros))));
alter policy "editan los miembros" on public.cuentas
  using (miembros @> array[(select auth.uid())]);
alter policy "ven los miembros" on public.cuentas
  using (grupo_id = (select public.mi_grupo()) and miembros @> array[(select auth.uid())]);
alter policy "invita el dueño a su grupo" on public.evento_invitados
  with check ((public.soy_dueno_evento(evento_id) AND (estado = 'pendiente'::text) AND public.puedo_invitar(perfil_id)));
alter policy "responde el invitado" on public.evento_invitados
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "saca el dueño o se va" on public.evento_invitados
  using (((perfil_id = (select auth.uid())) OR public.soy_dueno_evento(evento_id)));
alter policy "ve dueño e invitados" on public.evento_invitados
  using (((perfil_id = (select auth.uid())) OR public.soy_dueno_evento(evento_id) OR public.soy_invitado(evento_id)));
alter policy "borro los míos" on public.eventos
  using ((perfil_id = (select auth.uid())));
alter policy "creo los míos" on public.eventos
  with check ((perfil_id = (select auth.uid())));
alter policy "edito los míos" on public.eventos
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "veo los míos y a los que me invitaron" on public.eventos
  using (perfil_id = (select auth.uid()) or id = any((select public.mis_eventos_invitado())::bigint[]));
alter policy "míos" on public.faltas
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND public.soy_dueno_materia(materia_id)));
alter policy "míos" on public.favoritos
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "míos" on public.fijos
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "míos" on public.gastos
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "admin edita mi grupo" on public.grupos
  using (((id = (select public.mi_grupo())) AND (select public.soy_admin())))
  with check ((id = (select public.mi_grupo())));
alter policy "lee mi grupo" on public.grupos
  using ((id = (select public.mi_grupo())));
alter policy "míos" on public.guardados
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "admin borra" on public.guia_items
  using (((select public.soy_admin()) AND (grupo_id = (select public.mi_grupo()))));
alter policy "admin edita" on public.guia_items
  using (((select public.soy_admin()) AND (grupo_id = (select public.mi_grupo()))));
alter policy "admin suma" on public.guia_items
  with check (((select public.soy_admin()) AND (grupo_id = (select public.mi_grupo()))));
alter policy "lee" on public.guia_items
  using ((publicado AND ((grupo_id IS NULL) OR (grupo_id = (select public.mi_grupo())))));
alter policy "lee mi grupo" on public.juntada_respuestas
  using ((EXISTS ( SELECT 1 FROM juntadas j WHERE ((j.id = juntada_respuestas.juntada_id) AND (j.grupo_id = (select public.mi_grupo()))))));
alter policy "borra el autor o admin" on public.juntadas
  using (((grupo_id = (select public.mi_grupo())) AND ((creada_por = (select auth.uid())) OR (select public.soy_admin()))));
alter policy "edita el autor" on public.juntadas
  using ((creada_por = (select auth.uid())));
alter policy "lee mi grupo" on public.juntadas
  using ((grupo_id = (select public.mi_grupo())));
alter policy "propone" on public.juntadas
  with check (((grupo_id = (select public.mi_grupo())) AND (creada_por = (select auth.uid()))));
alter policy "admin suma" on public.lugares
  with check (((select public.soy_admin()) AND (grupo_id = (select public.mi_grupo()))));
alter policy "lee" on public.lugares
  using (((grupo_id IS NULL) OR (grupo_id = (select public.mi_grupo()))));
alter policy "míos" on public.materia_correlativas
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND public.soy_dueno_materia(materia_id) AND public.soy_dueno_materia(requiere_id)));
alter policy "míos" on public.materias
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "míos" on public.mazos
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND ((materia_id IS NULL) OR public.soy_dueno_materia(materia_id))));
alter policy "miembro escribe como sí mismo" on public.mensajes
  with check (((autor_id = (select auth.uid())) AND public.soy_miembro(conversacion_id) AND (NOT (EXISTS ( SELECT 1 FROM (conversacion_miembros x JOIN bloqueos b ON ((b.perfil_id = x.perfil_id))) WHERE ((x.conversacion_id = mensajes.conversacion_id) AND (b.bloqueado_id = (select auth.uid()))))))));
alter policy "solo miembros" on public.mensajes
  using (conversacion_id = any((select public.mis_conversaciones_ids())::uuid[]));
alter policy "míos" on public.metas
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "míos" on public.movimientos
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "marco leída" on public.notificaciones
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "míos" on public.notificaciones
  using ((perfil_id = (select auth.uid())));
alter policy "edita el propio" on public.perfiles
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));
alter policy "lee el propio" on public.perfiles
  using ((id = (select auth.uid())));
alter policy "veo las comunes y las mías" on public.plata_categorias
  using (((perfil_id IS NULL) OR (perfil_id = (select auth.uid()))));
alter policy "míos" on public.progreso_items
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "borro los míos" on public.resumenes
  using ((perfil_id = (select auth.uid())));
alter policy "edito los míos" on public.resumenes
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND (grupo_id = (select public.mi_grupo()))));
alter policy "sumo los míos" on public.resumenes
  with check (((perfil_id = (select auth.uid())) AND (grupo_id = (select public.mi_grupo()))));
alter policy "veo los míos y los del grupo" on public.resumenes
  using (((perfil_id = (select auth.uid())) OR (compartido AND (grupo_id = (select public.mi_grupo())))));
alter policy "míos" on public.sesiones_foco
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND ((materia_id IS NULL) OR public.soy_dueno_materia(materia_id))));
alter policy "míos" on public.suscripciones_push
  using ((perfil_id = (select auth.uid())))
  with check ((perfil_id = (select auth.uid())));
alter policy "comparte el dueño con su grupo" on public.tarea_lista_miembros
  with check ((public.soy_dueno_lista(lista_id) AND (perfil_id <> (select auth.uid())) AND public.puedo_invitar(perfil_id)));
alter policy "saca el dueño o se va" on public.tarea_lista_miembros
  using (((perfil_id = (select auth.uid())) OR public.soy_dueno_lista(lista_id)));
alter policy "ven dueño y miembros" on public.tarea_lista_miembros
  using (perfil_id = (select auth.uid()) or lista_id = any((select public.mis_listas())::bigint[]));
alter policy "borro las mías" on public.tarea_listas
  using ((perfil_id = (select auth.uid())));
alter policy "creo las mías" on public.tarea_listas
  with check (((perfil_id = (select auth.uid())) AND (grupo_id = (select public.mi_grupo()))));
alter policy "edito las mías" on public.tarea_listas
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND (grupo_id = (select public.mi_grupo()))));
alter policy "veo las mías y las compartidas" on public.tarea_listas
  using (perfil_id = (select auth.uid()) or id = any((select public.mis_listas())::bigint[]));
alter policy "borro tareas" on public.tareas
  using ((lista_id is null and perfil_id = (select auth.uid())) or lista_id = any((select public.mis_listas())::bigint[]));
alter policy "edito tareas" on public.tareas
  using ((lista_id is null and perfil_id = (select auth.uid())) or lista_id = any((select public.mis_listas())::bigint[]))
  with check ((lista_id is null and perfil_id = (select auth.uid())) or lista_id = any((select public.mis_listas())::bigint[]));
alter policy "sumo tareas" on public.tareas
  with check (((perfil_id = (select auth.uid())) AND ((lista_id IS NULL) OR public.soy_dueno_lista(lista_id) OR public.soy_miembro_lista(lista_id)) AND ((evento_id IS NULL) OR public.soy_dueno_evento(evento_id))));
alter policy "veo las mías y las de mis listas" on public.tareas
  using ((lista_id is null and perfil_id = (select auth.uid())) or lista_id = any((select public.mis_listas())::bigint[]));
alter policy "míos" on public.tarjetas
  using ((perfil_id = (select auth.uid())))
  with check (((perfil_id = (select auth.uid())) AND public.soy_dueno_mazo(mazo_id)));

-- ═══════════════ 0013_cola_avisos_y_limites ═══════════════
-- Registro de errores, cupos por persona, cola de push y avisos que no frenan a quien escribe.

-- ═══════════ Registro de errores ═══════════
-- Sin datos personales: no guarda usuario ni IP, y el texto pasa por limpiar_error().
-- Mismo error, mismo día: suma una vez en vez de crear otra fila.
create table public.errores_app (
  id bigint generated always as identity primary key,
  dia date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  origen text not null,
  codigo text not null default '',
  mensaje text not null,
  ruta text not null default '',
  veces int not null default 1,
  ultimo_en timestamptz not null default now(),
  unique (dia, origen, codigo, mensaje, ruta)
);
alter table public.errores_app enable row level security;
revoke all on public.errores_app from anon, authenticated;

create function public.limpiar_error(t text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select left(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(t,''),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}','<id>','g'),
      '[^ @]+@[^ @]+','<correo>','g'),
      'eyJ[A-Za-z0-9_.-]+','<token>','g'),
      '[0-9]{3,}','<n>','g'), 300)
$$;

-- Lo llaman el servidor y la app. Tope por día para que nadie llene la tabla.
create function public.registrar_error(p_origen text, p_codigo text default '', p_mensaje text default '', p_ruta text default '') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if (select count(*) from (select 1 from errores_app where dia=hoy limit 2000) x) >= 2000 then return; end if;
  insert into errores_app(dia,origen,codigo,mensaje,ruta)
  values (hoy,left(coalesce(p_origen,'?'),40),left(coalesce(p_codigo,''),40),public.limpiar_error(p_mensaje),
    left(regexp_replace(public.limpiar_error(p_ruta),'\?.*$',''),120))
  on conflict (dia,origen,codigo,mensaje,ruta) do update set veces=errores_app.veces+1, ultimo_en=now();
exception when others then null;  -- registrar un error nunca rompe lo que estaba pasando
end $$;
revoke all on function public.limpiar_error(text) from public, anon, authenticated;
revoke all on function public.registrar_error(text,text,text,text) from public;
grant execute on function public.registrar_error(text,text,text,text) to anon, authenticated;

-- ═══════════ Cupos por persona ═══════════
-- UNLOGGED: son contadores de minutos, si se pierden tras una caída no pasa nada.
create unlogged table public.cupos_uso (
  clave text not null,
  ventana timestamptz not null,
  usos int not null default 1,
  primary key (clave, ventana)
);
alter table public.cupos_uso enable row level security;
revoke all on public.cupos_uso from anon, authenticated;

create function public.cupo_interno(p_clave text, p_por_minuto int, p_por_dia int) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  insert into cupos_uso(clave,ventana) values (p_clave,date_trunc('minute',now()))
  on conflict (clave,ventana) do update set usos=cupos_uso.usos+1 returning usos into n;
  if n>p_por_minuto then return false; end if;
  insert into cupos_uso(clave,ventana) values (p_clave,date_trunc('day',now()))
  on conflict (clave,ventana) do update set usos=cupos_uso.usos+1 returning usos into n;
  return n<=p_por_dia;
end $$;
revoke all on function public.cupo_interno(text,int,int) from public, anon, authenticated;

-- Para las rutas del servidor: usa la sesión de quien llama, nunca un id que venga de afuera.
create function public.consumir_cupo(p_accion text, p_por_minuto int, p_por_dia int) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or p_accion not in ('voz','cal') then return false; end if;
  return public.cupo_interno(p_accion||':'||auth.uid(),p_por_minuto,p_por_dia);
end $$;
revoke all on function public.consumir_cupo(text,int,int) from public, anon;
grant execute on function public.consumir_cupo(text,int,int) to authenticated;

-- Frena ráfagas sobre lo que manda avisos a otras personas. Solo aplica a usuarios, no a los procesos internos.
create function public.limitar_escritura() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.cupo_interno(tg_argv[0]||':'||auth.uid(),tg_argv[1]::int,tg_argv[2]::int) then
    raise exception 'Esperá un poco antes de seguir.' using errcode='PT429';
  end if;
  return new;
end $$;
revoke all on function public.limitar_escritura() from public, anon, authenticated;
create trigger cupo_mensajes before insert on public.mensajes for each row execute function public.limitar_escritura('mensaje','40','2000');
create trigger cupo_aportes before insert on public.aportes for each row execute function public.limitar_escritura('aporte','6','60');
create trigger cupo_juntadas before insert on public.juntadas for each row execute function public.limitar_escritura('juntada','5','30');
create trigger cupo_invitados before insert on public.evento_invitados for each row execute function public.limitar_escritura('invitar','60','500');
create trigger cupo_listas before insert on public.tarea_lista_miembros for each row execute function public.limitar_escritura('compartir','30','200');

-- ═══════════ Cuándo un grupo pasa a ser "masivo" ═══════════
-- De acá para arriba no se avisa a todos ni se muestran casas exactas.
-- Se cambia con: insert into config_interna(clave,valor) values ('umbral_masivo','80') on conflict (clave) do update set valor=excluded.valor;
create function public.umbral_masivo() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select valor::int from config_interna where clave='umbral_masivo'),50)
$$;
create function public.grupo_masivo(g uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from (select 1 from perfiles where grupo_id=g limit public.umbral_masivo()+1) x) > public.umbral_masivo()
$$;
revoke all on function public.umbral_masivo(), public.grupo_masivo(uuid) from public, anon, authenticated;

-- ═══════════ Cola de push ═══════════
-- Antes: cada notificación hacía una llamada HTTP dentro de la transacción de quien escribía.
-- Ahora: se anota acá y un proceso las manda por lotes, con reintentos.
create table public.push_cola (
  notificacion_id bigint primary key references public.notificaciones(id) on delete cascade,
  intentos smallint not null default 0,
  proximo_intento timestamptz not null default now(),
  fallido_en timestamptz
) with (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 1000);
create index push_cola_pendientes_idx on public.push_cola(proximo_intento) where fallido_en is null;
alter table public.push_cola enable row level security;
revoke all on public.push_cola from anon, authenticated;

create function public.encolar_push() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into push_cola(notificacion_id)
  select n.id from nuevas n where exists(select 1 from suscripciones_push s where s.perfil_id=n.perfil_id);
  return null;
end $$;
revoke all on function public.encolar_push() from public, anon, authenticated;
drop trigger notif_push on public.notificaciones;
create trigger notif_push after insert on public.notificaciones
  referencing new table as nuevas for each statement execute function public.encolar_push();
drop function public.despachar_push();

-- Reserva un lote. Si el proceso se cae, lo reservado vuelve solo a la cola: nunca se pierde.
create function public.push_tomar_lote(p_secreto text, p_max int default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if p_secreto is null or p_secreto is distinct from (select valor from config_interna where clave='push_secreto') then return null; end if;
  -- Un aviso de hace más de 6 horas ya no sirve en el celular. Limpia una sola corrida a la vez.
  if pg_try_advisory_xact_lock(hashtext('push_limpieza')) then
    delete from push_cola c using notificaciones n
      where n.id=c.notificacion_id and c.fallido_en is null and c.proximo_intento<=now() and n.creado_en<now()-interval '6 hours';
    update push_cola set fallido_en=now() where fallido_en is null and intentos>=5 and proximo_intento<=now();
  end if;
  with tomadas as (
    update push_cola c set intentos=c.intentos+1, proximo_intento=now()+interval '2 minutes'*power(3,c.intentos)
    where c.notificacion_id in (
      select notificacion_id from push_cola
      where fallido_en is null and proximo_intento<=now()
      order by proximo_intento limit least(greatest(p_max,1),500) for update skip locked)
    returning c.notificacion_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'titulo',n.titulo,'cuerpo',n.cuerpo,'enlace',n.enlace,
      'subs',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)),'[]'::jsonb)
              from suscripciones_push s where s.perfil_id=n.perfil_id))),'[]'::jsonb) into r
  from tomadas t join notificaciones n on n.id=t.notificacion_id;
  return jsonb_build_object('items',r,
    'vapid_publica',(select valor from config_interna where clave='vapid_publica'),
    'vapid_privada',(select valor from config_interna where clave='vapid_privada'));
end $$;

-- Lo entregado sale de la cola. Lo que falló se queda y vuelve solo cuando le toque.
create function public.push_confirmar(p_secreto text, p_ok bigint[], p_subs_muertas bigint[] default '{}') returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_secreto is null or p_secreto is distinct from (select valor from config_interna where clave='push_secreto') then return false; end if;
  delete from push_cola where notificacion_id=any(p_ok);
  delete from suscripciones_push where id=any(p_subs_muertas);
  return true;
end $$;

-- Corre cada 10 segundos. Sin nada pendiente no llama a nadie.
create function public.push_despertar() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare u text; s text; n int;
begin
  select count(*) into n from (select 1 from push_cola where fallido_en is null and proximo_intento<=now() limit 1600) x;
  if n=0 then return; end if;
  select valor into u from config_interna where clave='push_url';
  select valor into s from config_interna where clave='push_secreto';
  if u is null or s is null then return; end if;
  -- Hasta 4 envíos a la vez según lo que haya acumulado; cada uno trabaja hasta 45 s.
  for i in 1..least(4,ceil(n/400.0)::int) loop
    perform net.http_post(url:=u, body:=jsonb_build_object('lote',true),
      headers:=jsonb_build_object('Content-Type','application/json','x-secreto',s), timeout_milliseconds:=55000);
  end loop;
end $$;
revoke all on function public.push_tomar_lote(text,int), public.push_confirmar(text,bigint[],bigint[]), public.push_despertar() from public, anon, authenticated;
-- La ruta del servidor entra con la clave pública y demuestra quién es con el secreto, igual que push_datos.
grant execute on function public.push_tomar_lote(text,int), public.push_confirmar(text,bigint[],bigint[]) to anon;
select cron.schedule('push-despertar','10 seconds','select public.push_despertar()');

-- ═══════════ Avisos sin trabar a quien escribe ═══════════
-- En un grupo masivo o una charla masiva nadie recibe aviso por cada mensaje:
-- la charla se marca sin leer y listo. Un grupo de amigos sigue igual que siempre.
create or replace function public.al_mensaje() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c conversaciones; quien text; n int;
begin
  select * into c from conversaciones where id=new.conversacion_id;
  select nombre into quien from perfiles where id=new.autor_id;
  update conversaciones set ultimo_en=new.creado_en, ultimo_texto=left(new.texto,120) where id=c.id;
  if c.tipo='grupo' then
    select count(*) into n from (select 1 from conversacion_miembros where conversacion_id=c.id limit public.umbral_masivo()+1) x;
    if n>public.umbral_masivo() then return new; end if;
  end if;
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select cm.perfil_id,'mensaje',case when c.tipo='grupo' then coalesce(c.titulo,'Grupo')||': '||quien else quien end,left(new.texto,140),'/gente/chat/'||c.id::text
  from conversacion_miembros cm join perfiles p on p.id=cm.perfil_id
  where cm.conversacion_id=c.id and cm.perfil_id<>new.autor_id and not cm.silenciada and coalesce((p.notif->>'mensajes')::boolean,true)
    and not exists(select 1 from bloqueos b where b.perfil_id=cm.perfil_id and b.bloqueado_id=new.autor_id);
  return new;
end $$;

create or replace function public.al_juntada() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare a text;
begin
  insert into juntada_respuestas(juntada_id,perfil_id,estado) values (new.id,new.creada_por,'voy');
  if public.grupo_masivo(new.grupo_id) then return new; end if;
  select nombre into a from perfiles where id=new.creada_por;
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select p.id,'juntada',a||' propuso una juntada',new.titulo||coalesce(' en '||new.lugar_nombre,''),'/gente/juntadas'
  from perfiles p where p.grupo_id=new.grupo_id and p.id<>new.creada_por and coalesce((p.notif->>'juntadas')::boolean,true);
  return new;
end $$;

create or replace function public.al_aporte() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare a text;
begin
  if new.tipo not in ('aviso','salida','pedido') or public.grupo_masivo(new.grupo_id) then return new; end if;
  select nombre into a from perfiles where id=new.autor_id;
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select p.id,'aviso',a||': '||new.titulo,new.nota,'/gente?v=grupo'
  from perfiles p where p.grupo_id=new.grupo_id and p.id<>new.autor_id and coalesce((p.notif->>'avisos')::boolean,true);
  return new;
end $$;

-- Abrir charlas: con cupo, y dos personas abriendo a la vez ya no chocan.
create or replace function public.abrir_directa(otro uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); cl text; c uuid;
begin
  if yo is null or otro = yo then raise exception 'no_valido'; end if;
  if not exists(select 1 from perfiles where id=otro and grupo_id=g) then raise exception 'otro_grupo'; end if;
  cl := least(yo::text,otro::text)||':'||greatest(yo::text,otro::text);
  select id into c from conversaciones where clave_directa=cl;
  if c is null then
    if not public.cupo_interno('abrir:'||yo,20,200) then raise exception 'Esperá un poco antes de seguir.' using errcode='PT429'; end if;
    insert into conversaciones(grupo_id,tipo,clave_directa) values (g,'directa',cl) on conflict (clave_directa) do nothing returning id into c;
    if c is null then select id into c from conversaciones where clave_directa=cl; end if;
    insert into conversacion_miembros(conversacion_id,perfil_id) values (c,yo),(c,otro) on conflict do nothing;
  end if;
  return c;
end $$;

-- El rol salía de los datos que manda quien se registra: cualquiera podía pedir admin.
-- Ahora solo vale app_metadata, que solo el servidor puede escribir.
create or replace function public.crear_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data,'{}');
  g uuid;
  cod text := nullif(m->>'codigo','');
  usu text := public.normalizar_usuario(coalesce(m->>'usuario', split_part(new.email,'@',1)));
begin
  if cod is not null then select id into g from grupos where upper(codigo_invitacion)=upper(cod); end if;
  if g is null then
    if cod is not null then raise exception 'codigo_invalido'; end if;
    select id into g from grupos where abierto order by creado_en limit 1;
  end if;
  if g is null then raise exception 'sin_grupo'; end if;
  insert into perfiles(id,grupo_id,usuario,nombre,debe_cambiar_clave,color,rol,casa_lat,casa_lon,casa_barrio)
  values (new.id,g,usu,coalesce(nullif(m->>'nombre',''),usu),coalesce((m->>'debe_cambiar_clave')::boolean,false),
    coalesce(m->>'color','#0B4F9E'),coalesce(new.raw_app_meta_data->>'rol','miembro'),(m->>'lat')::double precision,(m->>'lon')::double precision,m->>'barrio');
  insert into conversacion_miembros(conversacion_id,perfil_id)
    select id,new.id from conversaciones where grupo_id=g and tipo='grupo' on conflict do nothing;
  return new;
end $$;
revoke all on function public.crear_perfil_nuevo() from public, anon, authenticated;

-- Registro abierto: cupo por dirección de red para que nadie cree miles de cuentas con un script.
-- La dirección se guarda como hash y se borra sola a los 3 días. Permite a un aula entera detrás de una misma red.
create or replace function public.registrar_usuario(p_usuario text, p_nombre text, p_clave text, p_codigo text default null)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u text := public.normalizar_usuario(p_usuario); correo text; uid uuid := gen_random_uuid(); ip text;
begin
  if length(u) < 3 or length(u) > 24 then return 'usuario_invalido'; end if;
  if length(coalesce(p_clave,'')) < 8 then return 'clave_corta'; end if;
  ip := nullif(trim(split_part(coalesce((nullif(current_setting('request.headers',true),'')::json)->>'x-forwarded-for',''),',',1)),'');
  if ip is not null and not public.cupo_interno('registro:'||md5(ip||coalesce((select valor from config_interna where clave='push_secreto'),'')),15,150) then return 'muchos_intentos'; end if;
  if exists(select 1 from perfiles where usuario=u) then return 'usuario_ocupado'; end if;
  if nullif(trim(coalesce(p_codigo,'')),'') is not null and not exists(select 1 from grupos where upper(codigo_invitacion)=upper(trim(p_codigo))) then return 'codigo_invalido'; end if;
  correo := u||'@cuentas.santa-maria.app';
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
  values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',correo,crypt(p_clave,gen_salt('bf')),now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('usuario',u,'nombre',left(coalesce(nullif(trim(p_nombre),''),u),40),'codigo',nullif(trim(coalesce(p_codigo,'')),'')),
    now(),now(),'','','','');
  insert into auth.identities(id,user_id,identity_data,provider,provider_id,created_at,updated_at)
  values (gen_random_uuid(),uid,jsonb_build_object('sub',uid::text,'email',correo,'email_verified',true),'email',uid::text,now(),now());
  return 'ok';
end $$;

-- ═══════════════ 0014_crons_por_lotes ═══════════════
-- Los procesos automáticos dejan de recorrer a todos de un golpe.
-- agenda_avisos solo mira lo que vence; agenda_manana y plata_diaria avanzan de a tandas y retoman donde quedaron.

-- Saltea directo a la ventana pedida: antes recorría desde la primera fecha y a los 1.500 pasos se rendía,
-- así que un evento diario de hace más de 4 años dejaba de avisar.
create or replace function public.ocurrencias(e public.eventos, desde timestamptz, hasta timestamptz) returns setof timestamptz
language plpgsql stable set search_path = public, pg_temp as $$
declare paso interval; t timestamptz; tope timestamptz; n int := 0; ini int;
begin
  if e.repetir='no' then
    if e.fecha>=desde and e.fecha<=hasta then return next e.fecha; end if;
    return;
  end if;
  paso := case e.repetir when 'diario' then interval '1 day' when 'semanal' then interval '7 days' when 'quincenal' then interval '14 days' else interval '1 month' end;
  tope := least(hasta, coalesce((e.repetir_hasta+1)::timestamptz, hasta));
  if desde>e.fecha then
    ini := case when e.repetir='mensual'
      then greatest(0,(extract(year from age(desde,e.fecha))*12+extract(month from age(desde,e.fecha)))::int-1)
      else greatest(0,floor(extract(epoch from desde-e.fecha)/extract(epoch from paso))::int-1) end;
    n := ini;
  end if;
  ini := n;
  while n<ini+1500 loop
    t := e.fecha + paso*n;
    exit when t>tope;
    if t>=desde and not ((t at time zone 'America/Argentina/Buenos_Aires')::date = any(e.excepciones)) then return next t; end if;
    n := n+1;
  end loop;
end $$;

-- ═══════════ Agenda: cada evento sabe cuándo es su próximo aviso ═══════════
-- La cuenta se hace una vez, al guardar. El proceso solo toma lo vencido.
alter table public.eventos add column if not exists proximo_aviso timestamptz;
create index if not exists eventos_proximo_aviso_idx on public.eventos(proximo_aviso) where proximo_aviso is not null;

create function public.calcular_proximo_aviso(e public.eventos, desde timestamptz) returns timestamptz
language plpgsql stable set search_path = public, pg_temp as $$
declare lista int[]; mejor timestamptz; t timestamptz; m int; momento timestamptz; hasta timestamptz;
begin
  if e.hecho then return null; end if;
  lista := coalesce(e.avisos,'{}') || (case when e.viaje_min is not null then array[-(e.viaje_min+15)] else '{}'::int[] end);
  if cardinality(lista)=0 then return null; end if;
  hasta := case when e.repetir='no' then greatest(desde+interval '31 days',e.fecha) else desde+interval '31 days' end;
  for t in select * from public.ocurrencias(e,desde-interval '10 hours',hasta) loop
    foreach m in array lista loop
      momento := (case when e.todo_dia then t+interval '9 hours' else t end)-make_interval(mins=>abs(m));
      if momento>desde and (mejor is null or momento<mejor) then mejor := momento; end if;
    end loop;
  end loop;
  -- Sin nada en el próximo mes: un evento que se repite se vuelve a mirar más adelante.
  if mejor is null and e.repetir<>'no' and (e.repetir_hasta is null or e.repetir_hasta>=(desde at time zone 'America/Argentina/Buenos_Aires')::date) then
    mejor := desde+interval '25 days';
  end if;
  return mejor;
end $$;
revoke all on function public.calcular_proximo_aviso(public.eventos,timestamptz) from public, anon, authenticated;

create function public.evento_fijar_aviso() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.proximo_aviso := public.calcular_proximo_aviso(new,now());
  return new;
end $$;
revoke all on function public.evento_fijar_aviso() from public, anon, authenticated;
create trigger evento_aviso before insert or update of fecha, avisos, repetir, repetir_hasta, excepciones, todo_dia, viaje_min, hecho
  on public.eventos for each row execute function public.evento_fijar_aviso();

-- Eventos que ya existen (en producción la tabla está vacía; con datos tarda según cuántos haya).
update public.eventos set fecha=fecha where not hecho;

-- Corre cada minuto. Toma lo vencido, avisa y calcula el siguiente.
-- FOR UPDATE SKIP LOCKED: si dos corridas se pisan, no repiten ni se traban.
create or replace function public.agenda_avisos() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e eventos; t timestamptz; m int; momento timestamptz; lista int[]; n int;
  inicio timestamptz := clock_timestamp(); ahora timestamptz := now();
begin
  for e in select ev.* from eventos ev
    where ev.proximo_aviso<=ahora order by ev.proximo_aviso limit 2000 for update skip locked
  loop
    exit when clock_timestamp()-inicio>interval '45 seconds';
    begin
      lista := coalesce(e.avisos,'{}') || (case when e.viaje_min is not null then array[-(e.viaje_min+15)] else '{}'::int[] end);
      for t in select * from ocurrencias(e,ahora-interval '11 hours',ahora+interval '31 days') loop
        foreach m in array lista loop
          momento := (case when e.todo_dia then t+interval '9 hours' else t end)-make_interval(mins=>abs(m));
          -- Hasta 30 minutos de atraso se avisa igual; más que eso ya no sirve.
          if momento<=ahora and momento>ahora-interval '30 minutes' then
            insert into evento_avisos_enviados(evento_id,cuando,minutos) values (e.id,t,m) on conflict do nothing;
            get diagnostics n = row_count;
            if n=0 then continue; end if;
            insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
            select d.id,'agenda',
              case when m<0 then 'Salí en 15 minutos: '||e.titulo else initcap(frase_faltan(m))||': '||e.titulo end,
              case when m<0 then coalesce('Para llegar a '||e.lugar_nombre,'Para llegar a tiempo')
                   else to_char(t at time zone 'America/Argentina/Buenos_Aires','DD/MM')||(case when e.todo_dia then '' else ' a las '||to_char(t at time zone 'America/Argentina/Buenos_Aires','HH24:MI') end)||coalesce(' en '||e.lugar_nombre,'') end,
              '/agenda?e='||e.id
            from (select e.perfil_id id union select i.perfil_id from evento_invitados i where i.evento_id=e.id and i.estado<>'no') d
            where exists(select 1 from perfiles p where p.id=e.perfil_id and coalesce((p.notif->>'agenda')::boolean,true));
          end if;
        end loop;
      end loop;
      update eventos set proximo_aviso=calcular_proximo_aviso(e,ahora) where id=e.id;
    exception when others then
      perform registrar_error('cron/agenda_avisos',sqlstate,sqlerrm,'');
      update eventos set proximo_aviso=ahora+interval '1 hour' where id=e.id;
    end;
  end loop;
end $$;

-- ═══════════ Tandas ═══════════
-- Dónde quedó cada proceso largo del día. Si se corta, sigue desde ahí.
create table public.trabajos_cursor (
  trabajo text primary key,
  dia date not null,
  ultimo uuid,
  terminado boolean not null default false,
  actualizado_en timestamptz not null default now()
);
alter table public.trabajos_cursor enable row level security;
revoke all on public.trabajos_cursor from anon, authenticated;

-- Reserva la próxima tanda de personas. Devuelve la lista vacía si hoy ya terminó.
create function public.cursor_tanda(p_trabajo text, p_tam int, p_clave_notif text) returns uuid[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date; c trabajos_cursor; ids uuid[];
begin
  insert into trabajos_cursor(trabajo,dia,ultimo,terminado) values (p_trabajo,hoy,null,false) on conflict (trabajo) do nothing;
  select * into c from trabajos_cursor where trabajo=p_trabajo for update skip locked;
  if c.trabajo is null then return '{}'; end if;  -- otra corrida la está usando
  if c.dia<>hoy then
    update trabajos_cursor set dia=hoy, ultimo=null, terminado=false where trabajo=p_trabajo;
    c.ultimo := null; c.terminado := false;
  end if;
  if c.terminado then return '{}'; end if;
  select coalesce(array_agg(id),'{}') into ids from (
    select id from perfiles
    where (c.ultimo is null or id>c.ultimo) and coalesce((notif->>p_clave_notif)::boolean,true)
    order by id limit p_tam) x;
  update trabajos_cursor set ultimo=ids[cardinality(ids)], terminado=cardinality(ids)<p_tam, actualizado_en=now()
    where trabajo=p_trabajo;
  return ids;
end $$;
revoke all on function public.cursor_tanda(text,int,text) from public, anon, authenticated;

-- Corre cada minuto entre las 8 y las 9. consejos_enviados evita repetir si algo se reintenta.
create or replace function public.agenda_manana() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare ids uuid[] := cursor_tanda('agenda_manana',600,'agenda');
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  ini timestamptz := hoy::timestamp at time zone 'America/Argentina/Buenos_Aires';
begin
  if cardinality(ids)=0 then return; end if;
  with del_dia as (
    select e.perfil_id, count(*) n, min(e.titulo) primero
    from eventos e cross join lateral ocurrencias(e,ini,ini+interval '1 day') o
    where e.perfil_id=any(ids) and not e.hecho and (e.repetir<>'no' or (e.fecha>=ini and e.fecha<=ini+interval '1 day'))
    group by 1
  ), nuevos as (
    insert into consejos_enviados(perfil_id,clave)
    select perfil_id,'manana-'||hoy from del_dia on conflict do nothing returning perfil_id
  )
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select d.perfil_id,'agenda',case when d.n=1 then 'Hoy tenés 1 cosa' else 'Hoy tenés '||d.n||' cosas' end,d.primero,'/agenda'
  from del_dia d join nuevos x on x.perfil_id=d.perfil_id;
end $$;

-- Los consejos de una persona: el mismo texto de siempre, separado para poder ir de a tandas.
create function public.plata_consejos(p_id uuid, p_preferencias jsonb, hoy date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  mes date := date_trunc('month',hoy)::date;
  ult int := extract(day from (mes+interval '1 month'-interval '1 day'))::int;
  dhoy int := extract(day from hoy)::int;
  clave_mes text := to_char(hoy,'YYYY-MM');
  f fijos; c record;
  gastado numeric; ingresos numeric; tope numeric; antes numeric; ultimo date;
begin
  select coalesce(sum(monto) filter (where tipo='gasto'),0), coalesce(sum(monto) filter (where tipo='ingreso'),0), max(creado_en)::date
    into gastado, ingresos, ultimo from movimientos where perfil_id=p_id and fecha>=mes and fecha<=hoy;
  tope := nullif((p_preferencias->>'presupuesto')::numeric,0);

  for f in select * from fijos x where x.perfil_id=p_id and x.activo and x.tipo='gasto' and least(x.dia,ult)=dhoy+1 loop
    perform consejo(p_id,'fijo-'||f.id||'-'||clave_mes,'Mañana se anota '||f.nombre,pesos_txt(f.monto)||'. Fijate que tengas la plata.');
  end loop;

  if tope is not null then
    if gastado>=tope then
      perform consejo(p_id,'tope-100-'||clave_mes,'Te pasaste del presupuesto',
        'Gastaste '||pesos_txt(gastado)||' de '||pesos_txt(tope)||' y faltan '||(ult-dhoy)||' días.');
    elsif gastado>=tope*.8 then
      perform consejo(p_id,'tope-80-'||clave_mes,'Ya usaste el 80% del presupuesto',
        'Te quedan '||pesos_txt(tope-gastado)||': unos '||pesos_txt((tope-gastado)/greatest(ult-dhoy+1,1))||' por día hasta fin de mes.');
    end if;
  end if;

  for c in select m.categoria, sum(m.monto) total, cat.tope from movimientos m
      join plata_categorias cat on cat.nombre=m.categoria and cat.tipo='gasto' and cat.perfil_id=p_id and cat.tope is not null
      where m.perfil_id=p_id and m.tipo='gasto' and m.fecha>=mes and m.fecha<=hoy group by 1,3 having sum(m.monto)>=cat.tope*.9 loop
    perform consejo(p_id,'cat-'||c.categoria||'-'||clave_mes,c.categoria||' está por llegar al tope',pesos_txt(c.total)||' de '||pesos_txt(c.tope)||' este mes.');
  end loop;

  select coalesce(sum(monto),0) into antes from movimientos
    where perfil_id=p_id and tipo='gasto' and fecha>=mes-interval '1 month' and fecha<=hoy-interval '1 month';
  if dhoy>=10 and antes>0 and gastado>antes*1.2 then
    perform consejo(p_id,'ritmo-'||clave_mes,'Vas gastando más que el mes pasado',
      pesos_txt(gastado-antes)||' más que a esta altura del mes anterior.');
  end if;

  if ultimo is not null and ultimo<=hoy-3 then
    perform consejo(p_id,'anotar-'||to_char(hoy,'YYYY-MM-DD'),'¿Gastaste algo estos días?','Hace 3 días que no anotás nada. Tocá dos veces Billetera y listo.');
  end if;

  if extract(isodow from hoy)=7 and gastado>0 then
    perform consejo(p_id,'semana-'||to_char(hoy,'IYYY-IW'),'Tu semana en plata',
      'Gastaste '||pesos_txt((select coalesce(sum(monto),0) from movimientos where perfil_id=p_id and tipo='gasto' and fecha>hoy-7 and fecha<=hoy))||' en los últimos 7 días.','/billetera?v=numeros');
  end if;

  if dhoy=ult and (gastado>0 or ingresos>0) then
    perform consejo(p_id,'cierre-'||clave_mes,'Cerraste el mes',
      case when ingresos>=gastado then 'Te quedaron '||pesos_txt(ingresos-gastado)||'.' else 'Gastaste '||pesos_txt(gastado-ingresos)||' más de lo que entró.' end,'/billetera?v=numeros');
  end if;
end $$;
revoke all on function public.plata_consejos(uuid,jsonb,date) from public, anon, authenticated;

-- Corre cada minuto entre las 20 y las 21. Los fijos se anotan aparte de los consejos: si un consejo falla, el gasto queda.
create or replace function public.plata_diaria() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  mes date := date_trunc('month',hoy)::date;
  ult int := extract(day from (mes+interval '1 month'-interval '1 day'))::int;
  dhoy int := extract(day from hoy)::int;
  ids uuid[]; p record;
begin
  -- Una sola vez por día: si alguien borra el movimiento un rato después, no vuelve a aparecer.
  if not exists(select 1 from trabajos_cursor where trabajo='plata_diaria' and dia=hoy and (ultimo is not null or terminado)) then
    insert into movimientos(perfil_id,tipo,monto,categoria,fecha,nota,fijo_id)
    select x.perfil_id,x.tipo,x.monto,x.categoria,hoy,x.nombre,x.id from fijos x
    where x.activo and least(x.dia,ult)=dhoy on conflict do nothing;
  end if;

  ids := cursor_tanda('plata_diaria',600,'plata');
  for p in select id, preferencias from perfiles where id=any(ids) loop
    begin
      perform plata_consejos(p.id,p.preferencias,hoy);
    exception when others then
      perform registrar_error('cron/plata_diaria',sqlstate,sqlerrm,'');
    end;
  end loop;
end $$;

-- ═══════════ Limpieza nocturna ═══════════
-- Por tandas, con tope de tiempo, para no frenar la base.
create function public.mantenimiento_diario() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare inicio timestamptz := clock_timestamp(); n int;
begin
  -- Notificaciones: leídas a los 90 días, sin leer a los 180.
  loop
    delete from notificaciones where id in (
      select id from notificaciones
      where creado_en<now()-interval '90 days' and (leida or creado_en<now()-interval '180 days')
      limit 5000);
    get diagnostics n = row_count;
    exit when n<5000 or clock_timestamp()-inicio>interval '4 minutes';
  end loop;
  delete from evento_avisos_enviados where cuando<now()-interval '60 days';
  delete from consejos_enviados where creado_en<now()-interval '70 days';
  delete from cupos_uso where ventana<now()-interval '3 days';
  delete from push_cola where fallido_en<now()-interval '7 days';
  delete from errores_app where dia<now()-interval '30 days';
  begin
    delete from cron.job_run_details where end_time<now()-interval '3 days';
  exception when others then
    perform registrar_error('cron/mantenimiento',sqlstate,sqlerrm,'');
  end;
end $$;
revoke all on function public.mantenimiento_diario() from public, anon, authenticated;

-- ═══════════ Horarios (hora UTC: 11 = 8 de la mañana en Argentina) ═══════════
select cron.schedule('agenda-avisos','* * * * *','select public.agenda_avisos()');
select cron.schedule('agenda-manana','* 11 * * *','select public.agenda_manana()');
select cron.schedule('plata-diaria','* 23 * * *','select public.plata_diaria()');
select cron.schedule('mantenimiento-diario','17 7 * * *','select public.mantenimiento_diario()');

-- ═══════════════ 0015_personas_y_charlas ═══════════════
-- Lo que la app pide al abrir: tamaño fijo aunque el grupo tenga 10.000 personas.

-- ═══════════ Gente del grupo ═══════════
-- En un grupo chico devuelve a todos, como siempre. En uno masivo: vos, tus contactos y hasta p_limite más.
-- Y ahí la casa exacta no sale nunca: solo el barrio, si la persona lo deja visible.
drop function public.personas_del_grupo();
create function public.personas_del_grupo(p_limite int default 300)
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,bio text,ciudad_origen text,universidad_id text,carrera_texto text,anio_cursada int,barrio text,lat double precision,lon double precision,rol text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); masivo boolean := public.grupo_masivo(public.mi_grupo());
begin
  return query
  with contactos as (
    select x.perfil_id pid from conversacion_miembros cm
    join conversaciones c on c.id=cm.conversacion_id and c.tipo='directa'
    join conversacion_miembros x on x.conversacion_id=c.id and x.perfil_id<>yo
    where cm.perfil_id=yo limit 200
  ), elegidos as (
    select p.id pid from perfiles p where p.id=yo
    union select pid from contactos
    union (select p.id from perfiles p where p.grupo_id=g order by p.nombre limit least(greatest(p_limite,1),500))
  )
  select p.id,p.usuario,p.nombre,p.avatar_url,p.color,p.bio,p.ciudad_origen,p.universidad_id,p.carrera_texto,p.anio_cursada,
    case when p.casa_visibilidad='oculta' and p.id<>yo then null else p.casa_barrio end,
    case when p.id=yo or (p.casa_visibilidad='exacta' and not masivo) then p.casa_lat end,
    case when p.id=yo or (p.casa_visibilidad='exacta' and not masivo) then p.casa_lon end,
    p.rol
  from perfiles p join elegidos e on e.pid=p.id
  where p.grupo_id=g order by p.nombre;
end $$;
revoke all on function public.personas_del_grupo(int) from public, anon;
grant execute on function public.personas_del_grupo(int) to authenticated;

-- Buscar a alguien por nombre o usuario sin bajarse la lista entera.
create function public.buscar_personas(q text, p_limite int default 30)
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,bio text,ciudad_origen text,universidad_id text,carrera_texto text,anio_cursada int,barrio text,lat double precision,lon double precision,rol text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id,p.usuario,p.nombre,p.avatar_url,p.color,p.bio,p.ciudad_origen,p.universidad_id,p.carrera_texto,p.anio_cursada,
    case when p.casa_visibilidad='oculta' and p.id<>auth.uid() then null else p.casa_barrio end,
    null::double precision, null::double precision, p.rol
  from perfiles p
  where p.grupo_id=public.mi_grupo() and length(trim(coalesce(q,'')))>=2
    and (p.nombre ilike '%'||replace(replace(trim(q),'%','\%'),'_','\_')||'%' or (public.normalizar_usuario(q)<>'' and p.usuario like '%'||public.normalizar_usuario(q)||'%'))
  order by p.nombre limit least(greatest(p_limite,1),50)
$$;
-- Completar nombres y fotos que no vinieron en la lista inicial (autores del muro, de un chat...).
create function public.personas_por_id(p_ids uuid[])
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,bio text,ciudad_origen text,universidad_id text,carrera_texto text,anio_cursada int,barrio text,lat double precision,lon double precision,rol text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id,p.usuario,p.nombre,p.avatar_url,p.color,p.bio,p.ciudad_origen,p.universidad_id,p.carrera_texto,p.anio_cursada,
    case when p.casa_visibilidad='oculta' and p.id<>auth.uid() then null else p.casa_barrio end,
    null::double precision, null::double precision, p.rol
  from perfiles p
  where p.grupo_id=public.mi_grupo() and p.id=any(p_ids[1:200])
$$;
revoke all on function public.buscar_personas(text,int), public.personas_por_id(uuid[]) from public, anon;
grant execute on function public.buscar_personas(text,int), public.personas_por_id(uuid[]) to authenticated;

-- ═══════════ Charlas ═══════════
-- Solo cuenta en las charlas con movimiento desde la última lectura, y hasta 100 por charla: la app muestra "99+".
drop function public.mis_conversaciones();
create function public.mis_conversaciones(p_limite int default 60, p_id uuid default null)
returns table(id uuid,tipo text,titulo text,ultimo_en timestamptz,ultimo_texto text,sin_leer bigint,otro_id uuid,otro_nombre text,otro_color text,otro_avatar text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id,c.tipo,c.titulo,c.ultimo_en,c.ultimo_texto,
    case when c.ultimo_en>cm.ultimo_leido_en then
      (select count(*) from (select 1 from mensajes m where m.conversacion_id=c.id and m.creado_en>cm.ultimo_leido_en and m.autor_id<>auth.uid() limit 100) z)
    else 0 end,
    o.id,o.nombre,o.color,o.avatar_url
  from (select cm0.* from conversacion_miembros cm0 join conversaciones c0 on c0.id=cm0.conversacion_id
        where cm0.perfil_id=auth.uid() and (p_id is null or cm0.conversacion_id=p_id)
        order by c0.ultimo_en desc limit least(greatest(p_limite,1),200)) cm
  join conversaciones c on c.id=cm.conversacion_id
  left join lateral (select p.id,p.nombre,p.color,p.avatar_url from conversacion_miembros x join perfiles p on p.id=x.perfil_id
     where c.tipo='directa' and x.conversacion_id=c.id and x.perfil_id<>auth.uid() limit 1) o on true
  order by c.ultimo_en desc
$$;
revoke all on function public.mis_conversaciones(int,uuid) from public, anon;
grant execute on function public.mis_conversaciones(int,uuid) to authenticated;

-- Los dos globitos en una sola llamada.
create function public.mis_recuentos() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'sin_leer',(select coalesce(sum((select count(*) from (select 1 from mensajes m where m.conversacion_id=c.id and m.creado_en>cm.ultimo_leido_en and m.autor_id<>auth.uid() limit 100) z)),0)
      from conversacion_miembros cm join conversaciones c on c.id=cm.conversacion_id
      where cm.perfil_id=auth.uid() and c.ultimo_en>cm.ultimo_leido_en),
    'avisos',(select count(*) from (select 1 from notificaciones n where n.perfil_id=auth.uid() and not n.leida limit 100) z))
$$;
revoke all on function public.mis_recuentos() from public, anon;
grant execute on function public.mis_recuentos() to authenticated;

-- ═══════════ Calendario para Google y Apple ═══════════
-- El OR recorría todos los eventos de todas las personas. Ahora parte de los de esa persona, con tope.
create or replace function public.agenda_feed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid;
begin
  if p_token is null or length(p_token)<32 then return null; end if;
  select perfil_id into u from calendario_enlaces where token=p_token;
  if u is null then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'titulo',e.titulo,'tipo',e.tipo,'fecha',e.fecha,'fin',e.fin,'todo_dia',e.todo_dia,
      'lugar',e.lugar_nombre,'notas',e.notas,'repetir',e.repetir,'hasta',e.repetir_hasta,'excepciones',e.excepciones))
    from (select x.* from eventos x
      where not x.hecho and (x.repetir<>'no' or x.fecha>now()-interval '180 days')
        and x.id in (select id from eventos where perfil_id=u
                     union select evento_id from evento_invitados where perfil_id=u and estado<>'no')
      order by x.fecha desc limit 1500) e),'[]'::jsonb);
end $$;

-- ═══════════════ 0017_contactos ═══════════════
-- Un solo grupo grande: se ven en la lista, pero solo se escriben si aceptan el contacto.
-- Solo cambia algo en un grupo masivo (más de umbral_masivo() personas). Un grupo de amigos sigue igual.
-- Las charlas directas que ya existen quedan como contacto aceptado: nadie pierde una conversación.

-- ═══════════ Contactos ═══════════
-- Una fila por par de personas. Sin políticas ni permisos: todo pasa por las funciones de abajo,
-- así quien pidió nunca puede leer si le dijeron que no.
create table public.contactos (
  id bigint generated always as identity primary key,
  de_id uuid not null references public.perfiles(id) on delete cascade,
  para_id uuid not null references public.perfiles(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptado','rechazado')),
  mensaje text check (char_length(mensaje)<=200),
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  check (de_id<>para_id)
);
create unique index contactos_par_idx on public.contactos(least(de_id,para_id), greatest(de_id,para_id));
create index contactos_de_idx on public.contactos(de_id, estado);
create index contactos_para_idx on public.contactos(para_id, estado, creado_en desc);
alter table public.contactos enable row level security;
revoke all on public.contactos from public, anon, authenticated;

insert into public.contactos(de_id,para_id,estado,respondido_en)
select a.perfil_id,b.perfil_id,'aceptado',now()
from public.conversaciones c
join public.conversacion_miembros a on a.conversacion_id=c.id
join public.conversacion_miembros b on b.conversacion_id=c.id and a.perfil_id<b.perfil_id
where c.tipo='directa'
on conflict do nothing;

create function public.es_contacto(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from contactos where least(de_id,para_id)=least(a,b) and greatest(de_id,para_id)=greatest(a,b) and estado='aceptado')
$$;
revoke all on function public.es_contacto(uuid,uuid) from public, anon, authenticated;

-- Crea la charla de dos personas. Solo la usan las funciones de acá.
create function public.conversacion_directa(a uuid, b uuid, g uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare cl text := least(a::text,b::text)||':'||greatest(a::text,b::text); c uuid;
begin
  select id into c from conversaciones where clave_directa=cl;
  if c is null then
    insert into conversaciones(grupo_id,tipo,clave_directa) values (g,'directa',cl) on conflict (clave_directa) do nothing returning id into c;
    if c is null then select id into c from conversaciones where clave_directa=cl; end if;
    insert into conversacion_miembros(conversacion_id,perfil_id) values (c,a),(c,b) on conflict do nothing;
  end if;
  return c;
end $$;
revoke all on function public.conversacion_directa(uuid,uuid,uuid) from public, anon, authenticated;

-- En un grupo chico se abre directo y queda anotado como contacto, por si el grupo crece.
create or replace function public.abrir_directa(otro uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); cl text; c uuid;
begin
  if yo is null or otro = yo then raise exception 'no_valido'; end if;
  if not exists(select 1 from perfiles where id=otro and grupo_id=g) then raise exception 'otro_grupo'; end if;
  cl := least(yo::text,otro::text)||':'||greatest(yo::text,otro::text);
  select id into c from conversaciones where clave_directa=cl;
  if c is null then
    if public.grupo_masivo(g) and not public.es_contacto(yo,otro) then raise exception 'sin_contacto' using errcode='PT403'; end if;
    if not public.cupo_interno('abrir:'||yo,20,200) then raise exception 'Esperá un poco antes de seguir.' using errcode='PT429'; end if;
    c := public.conversacion_directa(yo,otro,g);
    insert into contactos(de_id,para_id,estado,respondido_en) values (yo,otro,'aceptado',now())
    on conflict (least(de_id,para_id), greatest(de_id,para_id)) do update set estado='aceptado', mensaje=null, respondido_en=now();
  end if;
  return c;
end $$;

-- Última barrera: aunque alguien llame directo a la API, sin contacto no sale nada.
create function public.exigir_contacto() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c conversaciones; otro uuid;
begin
  if auth.uid() is null then return new; end if;
  select * into c from conversaciones where id=new.conversacion_id;
  if c.tipo<>'directa' then return new; end if;
  select perfil_id into otro from conversacion_miembros where conversacion_id=c.id and perfil_id<>new.autor_id limit 1;
  if otro is null or public.es_contacto(new.autor_id,otro) or not public.grupo_masivo(c.grupo_id) then return new; end if;
  raise exception 'sin_contacto' using errcode='PT403';
end $$;
revoke all on function public.exigir_contacto() from public, anon, authenticated;
create trigger exigir_contacto before insert on public.mensajes for each row execute function public.exigir_contacto();

-- Pedir contacto. Devuelve: libre, enviada, muchas, no_disponible o no_valido.
-- Si ya te rechazaron responde "enviada" igual: no se avisa que dijeron que no ni se puede insistir.
create function public.pedir_contacto(otro uuid, p_mensaje text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); f contactos; quien text; n int;
begin
  if yo is null or otro is null or otro=yo or not exists(select 1 from perfiles where id=otro and grupo_id=g) then return 'no_valido'; end if;
  if exists(select 1 from bloqueos where (perfil_id=otro and bloqueado_id=yo) or (perfil_id=yo and bloqueado_id=otro)) then return 'no_disponible'; end if;
  if not public.grupo_masivo(g) then return 'libre'; end if;
  select * into f from contactos where least(de_id,para_id)=least(yo,otro) and greatest(de_id,para_id)=greatest(yo,otro) for update;
  if f.estado='aceptado' then return 'libre'; end if;
  if f.estado='pendiente' and f.para_id=yo then  -- los dos quieren: listo
    perform public.responder_contacto(otro,true);
    return 'libre';
  end if;
  if f.de_id=yo then return 'enviada'; end if;
  select count(*) into n from (select 1 from contactos where de_id=yo and estado='pendiente' limit 100) x;
  if n>=100 or not public.cupo_interno('solicitud:'||yo,5,20) then return 'muchas'; end if;
  insert into contactos(de_id,para_id,mensaje) values (yo,otro,nullif(left(trim(coalesce(p_mensaje,'')),200),''))
  on conflict (least(de_id,para_id), greatest(de_id,para_id)) do update
    set de_id=excluded.de_id, para_id=excluded.para_id, estado='pendiente', mensaje=excluded.mensaje, creado_en=now(), respondido_en=null
    where contactos.estado='rechazado';
  select nombre into quien from perfiles where id=yo;
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select p.id,'contacto',quien||' quiere escribirte',nullif(left(trim(coalesce(p_mensaje,'')),140),''),'/gente?v=personas'
  from perfiles p where p.id=otro and coalesce((p.notif->>'mensajes')::boolean,true);
  return 'enviada';
end $$;

-- Aceptar abre la charla y entrega el primer mensaje. Rechazar no le avisa a nadie.
create function public.responder_contacto(otro uuid, p_acepto boolean) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); txt text; c uuid; quien text;
begin
  if yo is null then raise exception 'no_valido'; end if;
  select mensaje into txt from contactos where de_id=otro and para_id=yo and estado='pendiente' for update;
  if not found then return null; end if;
  update contactos set estado=case when p_acepto then 'aceptado' else 'rechazado' end, mensaje=null, respondido_en=now()
  where de_id=otro and para_id=yo;
  if not p_acepto then return null; end if;
  c := public.conversacion_directa(yo,otro,g);
  if txt is not null then insert into mensajes(conversacion_id,autor_id,texto) values (c,otro,txt); end if;
  select nombre into quien from perfiles where id=yo;
  insert into notificaciones(perfil_id,tipo,titulo,enlace) values (otro,'contacto',quien||' aceptó tu solicitud','/gente/chat/'||c::text);
  return c;
end $$;

create function public.mis_solicitudes()
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,carrera_texto text,mensaje text,creado_en timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id,p.usuario,p.nombre,p.avatar_url,p.color,p.carrera_texto,c.mensaje,c.creado_en
  from contactos c join perfiles p on p.id=c.de_id
  where c.para_id=auth.uid() and c.estado='pendiente'
    and not exists(select 1 from bloqueos b where b.perfil_id=auth.uid() and b.bloqueado_id=c.de_id)
  order by c.creado_en desc limit 50
$$;
revoke all on function public.pedir_contacto(uuid,text), public.responder_contacto(uuid,boolean), public.mis_solicitudes() from public, anon;
grant execute on function public.pedir_contacto(uuid,text), public.responder_contacto(uuid,boolean), public.mis_solicitudes() to authenticated;

-- Invitar a un evento o a una lista también le manda un aviso: en un grupo masivo pide lo mismo.
create or replace function public.puedo_invitar(otro uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from perfiles p where p.id=otro and p.grupo_id=public.mi_grupo())
    and not exists(select 1 from bloqueos b where b.perfil_id=otro and b.bloqueado_id=auth.uid())
    and (public.es_contacto(auth.uid(),otro) or not public.grupo_masivo(public.mi_grupo()))
$$;

-- Bloquear corta cualquier solicitud pendiente entre los dos.
create function public.al_bloquear() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update contactos set estado='rechazado', mensaje=null, respondido_en=now()
  where estado='pendiente' and least(de_id,para_id)=least(new.perfil_id,new.bloqueado_id) and greatest(de_id,para_id)=greatest(new.perfil_id,new.bloqueado_id);
  return new;
end $$;
revoke all on function public.al_bloquear() from public, anon, authenticated;
create trigger bloqueo_nuevo after insert on public.bloqueos for each row execute function public.al_bloquear();

-- ═══════════ Denuncias ═══════════
-- El admin ve quién, quién y por qué. Nunca los mensajes: esos siguen siendo solo de la charla.
create table public.denuncias (
  id bigint generated always as identity primary key,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  denunciante_id uuid references public.perfiles(id) on delete set null,
  denunciado_id uuid references public.perfiles(id) on delete set null,
  motivo text not null check (motivo in ('acoso','spam','contenido','suplantacion','otro')),
  detalle text check (char_length(detalle)<=500),
  estado text not null default 'abierta' check (estado in ('abierta','revisada','descartada')),
  creado_en timestamptz not null default now(),
  revisada_por uuid references public.perfiles(id) on delete set null,
  revisada_en timestamptz
);
create unique index denuncias_una_abierta_idx on public.denuncias(denunciante_id, denunciado_id) where estado='abierta';
create index denuncias_denunciante_idx on public.denuncias(denunciante_id);
create index denuncias_grupo_idx on public.denuncias(grupo_id, estado, creado_en desc);
create index denuncias_denunciado_idx on public.denuncias(denunciado_id, estado);
create index denuncias_revisada_por_idx on public.denuncias(revisada_por);
create index perfiles_admin_idx on public.perfiles(grupo_id) where rol='admin';
alter table public.denuncias enable row level security;
revoke all on public.denuncias from public, anon, authenticated;
grant select on public.denuncias to authenticated;
create policy "quien denunció o el admin del grupo" on public.denuncias for select to authenticated
  using (denunciante_id=(select auth.uid()) or ((select public.soy_admin()) and grupo_id=(select public.mi_grupo())));

-- Devuelve ok, muchas o no_valido.
create function public.denunciar(otro uuid, p_motivo text, p_detalle text default null, p_bloquear boolean default false) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); n int;
begin
  if yo is null or otro is null or otro=yo or p_motivo not in ('acoso','spam','contenido','suplantacion','otro')
    or not exists(select 1 from perfiles where id=otro and grupo_id=g) then return 'no_valido'; end if;
  if p_bloquear then insert into bloqueos(perfil_id,bloqueado_id) values (yo,otro) on conflict do nothing; end if;
  if not public.cupo_interno('denuncia:'||yo,5,20) then return 'muchas'; end if;
  insert into denuncias(grupo_id,denunciante_id,denunciado_id,motivo,detalle)
  values (g,yo,otro,p_motivo,nullif(left(trim(coalesce(p_detalle,'')),500),''))
  on conflict (denunciante_id, denunciado_id) where estado='abierta' do nothing;
  get diagnostics n = row_count;
  if n>0 then
    insert into notificaciones(perfil_id,tipo,titulo,enlace)
    select p.id,'denuncia','Hay una denuncia nueva','/admin' from perfiles p
    where p.grupo_id=g and p.rol='admin' and p.id<>yo limit 5;
  end if;
  return 'ok';
end $$;

create function public.admin_denuncias(p_estado text default 'abierta', p_limite int default 50)
returns table(id bigint,motivo text,detalle text,estado text,creado_en timestamptz,
  denunciante_usuario text,denunciado_id uuid,denunciado_usuario text,denunciado_nombre text,abiertas bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select d.id,d.motivo,d.detalle,d.estado,d.creado_en,a.usuario,d.denunciado_id,b.usuario,b.nombre,
    (select count(*) from denuncias x where x.denunciado_id=d.denunciado_id and x.estado='abierta')
  from denuncias d left join perfiles a on a.id=d.denunciante_id left join perfiles b on b.id=d.denunciado_id
  where public.soy_admin() and d.grupo_id=public.mi_grupo() and d.estado=p_estado
  order by d.creado_en desc limit least(greatest(p_limite,1),100)
$$;

create function public.admin_resolver_denuncia(p_id bigint, p_estado text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.soy_admin() or p_estado not in ('revisada','descartada') then raise exception 'no_autorizado'; end if;
  update denuncias set estado=p_estado, revisada_por=auth.uid(), revisada_en=now()
  where id=p_id and grupo_id=public.mi_grupo();
end $$;
revoke all on function public.denunciar(uuid,text,text,boolean), public.admin_denuncias(text,int), public.admin_resolver_denuncia(bigint,text) from public, anon;
grant execute on function public.denunciar(uuid,text,text,boolean), public.admin_denuncias(text,int), public.admin_resolver_denuncia(bigint,text) to authenticated;

-- ═══════════ Lista y buscador ═══════════
-- Único lugar que decide qué se ve de otra persona. La tabla perfiles sigue siendo solo de cada uno.
-- En un grupo masivo: la casa exacta no sale nunca, ni a contactos. Sin contacto, solo nombre, foto y carrera.
-- Quien te bloqueó no aparece. trato: libre, enviada, recibida o nada.
create function public.personas_detalle(p_ids uuid[])
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,bio text,ciudad_origen text,universidad_id text,carrera_texto text,anio_cursada int,barrio text,lat double precision,lon double precision,rol text,trato text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); masivo boolean := public.grupo_masivo(public.mi_grupo());
begin
  return query
  select p.id,p.usuario,p.nombre,p.avatar_url,p.color,
    case when v.ve then p.bio end, case when v.ve then p.ciudad_origen end,
    p.universidad_id,p.carrera_texto,
    case when v.ve then p.anio_cursada end,
    case when v.ve and (p.casa_visibilidad<>'oculta' or p.id=yo) then p.casa_barrio end,
    case when p.id=yo or (p.casa_visibilidad='exacta' and not masivo) then p.casa_lat end,
    case when p.id=yo or (p.casa_visibilidad='exacta' and not masivo) then p.casa_lon end,
    p.rol,
    case when not masivo or p.id=yo or c.estado='aceptado' then 'libre'
         when c.estado='pendiente' and c.para_id=yo then 'recibida'
         when c.de_id=yo then 'enviada'
         else 'nada' end
  from perfiles p
  left join contactos c on p.id<>yo and least(c.de_id,c.para_id)=least(p.id,yo) and greatest(c.de_id,c.para_id)=greatest(p.id,yo)
  cross join lateral (select not masivo or p.id=yo or coalesce(c.estado='aceptado',false) as ve) v
  where p.grupo_id=g and p.id=any(p_ids)
    and (not masivo or p.id=yo or not exists(select 1 from bloqueos b where b.perfil_id=p.id and b.bloqueado_id=yo));
end $$;
revoke all on function public.personas_detalle(uuid[]) from public, anon, authenticated;

drop function public.personas_del_grupo(int);
drop function public.buscar_personas(text,int);
drop function public.personas_por_id(uuid[]);

-- Grupo chico: todos, como siempre. Masivo: vos, tus contactos y unos pocos de tu universidad; al resto se lo busca.
create function public.personas_del_grupo(p_limite int default 300)
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,bio text,ciudad_origen text,universidad_id text,carrera_texto text,anio_cursada int,barrio text,lat double precision,lon double precision,rol text,trato text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); uni text; ids uuid[];
begin
  if not public.grupo_masivo(g) then
    select array_agg(p.id) into ids from perfiles p where p.grupo_id=g;
  else
    select p.universidad_id into uni from perfiles p where p.id=yo;
    select array_agg(distinct x.i) into ids from (
      select yo i
      union all (select case when c.de_id=yo then c.para_id else c.de_id end from contactos c where c.de_id=yo and c.estado<>'rechazado' limit 300)
      union all (select c.de_id from contactos c where c.para_id=yo and c.estado in ('aceptado','pendiente') limit 300)
      union all (select p.id from perfiles p where p.grupo_id=g and p.universidad_id=uni order by p.nombre limit least(greatest(p_limite,1),40))
      union all (select p.id from perfiles p where p.grupo_id=g order by p.nombre limit least(greatest(p_limite,1),20))
    ) x;
  end if;
  return query select * from public.personas_detalle(ids) d order by d.nombre;
end $$;

-- Con cupo en un grupo masivo: buscar letra por letra no sirve para bajarse el padrón.
create function public.buscar_personas(q text, p_limite int default 30)
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,bio text,ciudad_origen text,universidad_id text,carrera_texto text,anio_cursada int,barrio text,lat double precision,lon double precision,rol text,trato text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); t text := trim(coalesce(q,'')); n text := public.normalizar_usuario(q); ids uuid[];
begin
  if yo is null or length(t)<2 then return; end if;
  if public.grupo_masivo(g) and not public.cupo_interno('buscar:'||yo,60,600) then return; end if;
  select array_agg(x.id) into ids from (
    select p.id from perfiles p
    where p.grupo_id=g and (p.nombre ilike '%'||replace(replace(t,'%','\%'),'_','\_')||'%' or (n<>'' and p.usuario like '%'||n||'%'))
    order by p.nombre limit least(greatest(p_limite,1),30)) x;
  return query select * from public.personas_detalle(ids) d order by d.nombre;
end $$;

create function public.personas_por_id(p_ids uuid[])
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,bio text,ciudad_origen text,universidad_id text,carrera_texto text,anio_cursada int,barrio text,lat double precision,lon double precision,rol text,trato text)
language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.personas_detalle(p_ids[1:200])
$$;
revoke all on function public.personas_del_grupo(int), public.buscar_personas(text,int), public.personas_por_id(uuid[]) from public, anon;
grant execute on function public.personas_del_grupo(int), public.buscar_personas(text,int), public.personas_por_id(uuid[]) to authenticated;

-- ═══════════════ Nombre nuevo ═══════════════
update public.grupos set nombre='FAMA' where nombre='Santa María';
update public.conversaciones set titulo='FAMA' where tipo='grupo' and titulo='Santa María';

commit;
select 'FAMA lista' as resultado;
