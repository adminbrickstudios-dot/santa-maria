-- ───── RLS: nada se lee ni se escribe sin regla explícita ─────
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create policy "lee mi grupo" on grupos for select to authenticated using (id=mi_grupo());
create policy "admin edita mi grupo" on grupos for update to authenticated using (id=mi_grupo() and soy_admin()) with check (id=mi_grupo());

create policy "lee" on universidades for select to anon, authenticated using (true);
create policy "lee" on carreras for select to anon, authenticated using (true);
create policy "lee" on secciones_guia for select to authenticated using (true);
create policy "lee" on bloques_guia for select to authenticated using (true);
create policy "lee" on test_preguntas for select to authenticated using (true);

-- Cada uno lee solo su fila. El panel admin pasa por el servidor y no ve casas ni contraseñas.
create policy "lee el propio" on perfiles for select to authenticated using (id=auth.uid());
create policy "edita el propio" on perfiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "lee" on guia_items for select to authenticated using (publicado and (grupo_id is null or grupo_id=mi_grupo()));
create policy "admin suma" on guia_items for insert to authenticated with check (soy_admin() and grupo_id=mi_grupo());
create policy "admin edita" on guia_items for update to authenticated using (soy_admin() and grupo_id=mi_grupo());
create policy "admin borra" on guia_items for delete to authenticated using (soy_admin() and grupo_id=mi_grupo());

create policy "míos" on guardados for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "míos" on progreso_items for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "míos" on favoritos for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "míos" on materias for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "míos" on clases for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "míos" on eventos for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "míos" on gastos for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "míos" on suscripciones_push for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "míos" on bloqueos for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

create policy "lee" on lugares for select to authenticated using (grupo_id is null or grupo_id=mi_grupo());
create policy "admin suma" on lugares for insert to authenticated with check (soy_admin() and grupo_id=mi_grupo());

create policy "lee mi grupo" on aportes for select to authenticated using (grupo_id=mi_grupo());
create policy "suma como yo" on aportes for insert to authenticated with check (grupo_id=mi_grupo() and autor_id=auth.uid());
create policy "borra el autor o admin" on aportes for delete to authenticated using (grupo_id=mi_grupo() and (autor_id=auth.uid() or soy_admin()));

-- Los mensajes solo los ven los miembros de cada conversación. Ni el admin los lee.
create policy "solo miembros" on conversaciones for select to authenticated using (soy_miembro(id));
create policy "veo mis filas" on conversacion_miembros for select to authenticated using (perfil_id=auth.uid() or soy_miembro(conversacion_id));
create policy "edito mi fila" on conversacion_miembros for update to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "solo miembros" on mensajes for select to authenticated using (soy_miembro(conversacion_id));
create policy "miembro escribe como sí mismo" on mensajes for insert to authenticated with check (
  autor_id=auth.uid() and soy_miembro(conversacion_id)
  and not exists(select 1 from conversacion_miembros x join bloqueos b on b.perfil_id=x.perfil_id
    where x.conversacion_id=mensajes.conversacion_id and b.bloqueado_id=auth.uid()));

create policy "lee mi grupo" on juntadas for select to authenticated using (grupo_id=mi_grupo());
create policy "propone" on juntadas for insert to authenticated with check (grupo_id=mi_grupo() and creada_por=auth.uid());
create policy "edita el autor" on juntadas for update to authenticated using (creada_por=auth.uid());
create policy "borra el autor o admin" on juntadas for delete to authenticated using (grupo_id=mi_grupo() and (creada_por=auth.uid() or soy_admin()));
create policy "lee mi grupo" on juntada_respuestas for select to authenticated using (exists(select 1 from juntadas j where j.id=juntada_id and j.grupo_id=mi_grupo()));
create policy "respondo yo" on juntada_respuestas for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid() and exists(select 1 from juntadas j where j.id=juntada_id and j.grupo_id=mi_grupo()));

create policy "ven los miembros" on cuentas for select to authenticated using (grupo_id=mi_grupo() and auth.uid()=any(miembros));
create policy "crea" on cuentas for insert to authenticated with check (grupo_id=mi_grupo() and creada_por=auth.uid() and auth.uid()=any(miembros));
create policy "editan los miembros" on cuentas for update to authenticated using (auth.uid()=any(miembros));
create policy "ven los miembros" on cuenta_gastos for select to authenticated using (exists(select 1 from cuentas c where c.id=cuenta_id and auth.uid()=any(c.miembros)));
create policy "suman los miembros" on cuenta_gastos for insert to authenticated with check (exists(select 1 from cuentas c where c.id=cuenta_id and auth.uid()=any(c.miembros) and pago_id=any(c.miembros)));
create policy "borran los miembros" on cuenta_gastos for delete to authenticated using (exists(select 1 from cuentas c where c.id=cuenta_id and auth.uid()=any(c.miembros)));

create policy "lee mi grupo" on apuntes for select to authenticated using (grupo_id=mi_grupo());
create policy "suma como yo" on apuntes for insert to authenticated with check (grupo_id=mi_grupo() and autor_id=auth.uid());
create policy "borra el autor o admin" on apuntes for delete to authenticated using (grupo_id=mi_grupo() and (autor_id=auth.uid() or soy_admin()));

create policy "míos" on notificaciones for select to authenticated using (perfil_id=auth.uid());
create policy "marco leída" on notificaciones for update to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
-- config_interna queda sin políticas: solo el servidor.

revoke all on public.config_interna from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
revoke all on public.config_interna from authenticated;
grant select on public.universidades, public.carreras to anon;
grant usage,select on all sequences in schema public to authenticated;
revoke execute on function public.crear_perfil_nuevo() from public, anon, authenticated;
grant execute on function public.usuario_disponible(text) to anon, authenticated;

-- Tiempo real para mensajes y notificaciones
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.mensajes, public.notificaciones, public.juntada_respuestas;
  end if;
end $$;

-- Fotos de perfil
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit) values ('avatares','avatares',true,3145728) on conflict do nothing;
    execute $p$create policy "sube la propia" on storage.objects for insert to authenticated with check (bucket_id='avatares' and (storage.foldername(name))[1]=auth.uid()::text)$p$;
    execute $p$create policy "cambia la propia" on storage.objects for update to authenticated using (bucket_id='avatares' and (storage.foldername(name))[1]=auth.uid()::text)$p$;
  end if;
end $$;
