-- RLS rápida: cada política calcula quién sos UNA vez por consulta, no una vez por fila.
-- No cambia quién ve qué: solo cómo se evalúa. Las políticas se reescriben con ALTER POLICY,
-- así nunca hay un momento sin regla. Toma un lock breve por tabla; si algo tarda más de 5 s,
-- la migración falla entera y se puede repetir.
set lock_timeout = '5s';

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
