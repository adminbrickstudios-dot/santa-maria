-- Las claves de notificaciones viven en la base y las genera el servidor.
create or replace function public.push_datos(p_id bigint, p_secreto text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n notificaciones;
begin
  if p_secreto is null or p_secreto is distinct from (select valor from config_interna where clave='push_secreto') then return null; end if;
  select * into n from notificaciones where id=p_id;
  if n.id is null then return null; end if;
  return jsonb_build_object('titulo',n.titulo,'cuerpo',n.cuerpo,'enlace',n.enlace,
    'vapid_publica',(select valor from config_interna where clave='vapid_publica'),
    'vapid_privada',(select valor from config_interna where clave='vapid_privada'),
    'subs',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)) from suscripciones_push s where s.perfil_id=n.perfil_id),'[]'::jsonb));
end $$;

create or replace function public.push_guardar_claves(p_secreto text, p_publica text, p_privada text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_secreto is null or p_secreto is distinct from (select valor from config_interna where clave='push_secreto') then return false; end if;
  insert into config_interna(clave,valor) values ('vapid_publica',p_publica),('vapid_privada',p_privada) on conflict (clave) do nothing;
  return true;
end $$;

create or replace function public.push_clave_publica() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select valor from config_interna where clave='vapid_publica'
$$;

revoke all on function public.push_guardar_claves(text,text,text) from public, authenticated;
grant execute on function public.push_guardar_claves(text,text,text) to anon;
revoke all on function public.push_clave_publica() from public, anon;
grant execute on function public.push_clave_publica() to authenticated;
