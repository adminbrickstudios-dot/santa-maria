-- Alta y administración de cuentas sin exponer claves de servicio.
create or replace function public.registrar_usuario(p_usuario text, p_nombre text, p_clave text, p_codigo text default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare u text := public.normalizar_usuario(p_usuario); correo text; uid uuid := gen_random_uuid();
begin
  if length(u) < 3 or length(u) > 24 then return 'usuario_invalido'; end if;
  if length(coalesce(p_clave,'')) < 8 then return 'clave_corta'; end if;
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
revoke all on function public.registrar_usuario(text,text,text,text) from public;
grant execute on function public.registrar_usuario(text,text,text,text) to anon, authenticated;

create or replace function public.admin_cuentas()
returns table(id uuid,usuario text,nombre text,color text,avatar_url text,email_contacto text,debe_cambiar_clave boolean)
language sql stable security definer set search_path = public as $$
  select id,usuario,nombre,color,avatar_url,email_contacto,debe_cambiar_clave from perfiles
  where soy_admin() and grupo_id=mi_grupo() order by nombre
$$;
create or replace function public.admin_poner_mail(p uuid, mail text) returns void
language sql security definer set search_path = public as $$
  update perfiles set email_contacto=nullif(trim(mail),'') where id=p and soy_admin() and grupo_id=mi_grupo()
$$;
create or replace function public.admin_resetear_clave(p uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not soy_admin() or not exists(select 1 from perfiles where id=p and grupo_id=mi_grupo()) then raise exception 'no_autorizado'; end if;
  update auth.users set encrypted_password=crypt('12345678',gen_salt('bf')), updated_at=now() where id=p;
  update perfiles set debe_cambiar_clave=true where id=p;
end $$;

-- El servidor de la app pide con un secreto lo que necesita para mandar un push.
create or replace function public.push_datos(p_id bigint, p_secreto text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n notificaciones;
begin
  if p_secreto is null or p_secreto is distinct from (select valor from config_interna where clave='push_secreto') then return null; end if;
  select * into n from notificaciones where id=p_id;
  if n.id is null then return null; end if;
  return jsonb_build_object('titulo',n.titulo,'cuerpo',n.cuerpo,'enlace',n.enlace,
    'subs',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)) from suscripciones_push s where s.perfil_id=n.perfil_id),'[]'::jsonb));
end $$;
create or replace function public.push_borrar(p_id bigint, p_secreto text) returns void
language sql security definer set search_path = public as $$
  delete from suscripciones_push where id=p_id and p_secreto is not distinct from (select valor from config_interna where clave='push_secreto') and p_secreto is not null
$$;

-- Recordatorios automáticos
create or replace function public.recordatorios() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select e.perfil_id,'facu','Mañana: '||e.titulo,'No te olvides.','/facu?v=fechas'
  from eventos e join perfiles p on p.id=e.perfil_id
  where not e.hecho and e.fecha between now()+interval '23 hours' and now()+interval '24 hours'
    and coalesce((p.notif->>'facu')::boolean,true);
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select r.perfil_id,'juntada','En dos horas: '||j.titulo,j.lugar_nombre,'/gente/juntadas'
  from juntadas j join juntada_respuestas r on r.juntada_id=j.id and r.estado='voy' join perfiles p on p.id=r.perfil_id
  where j.cuando between now()+interval '1 hour' and now()+interval '2 hours'
    and j.cuando-interval '2 hours' between now()-interval '1 hour' and now()
    and coalesce((p.notif->>'juntadas')::boolean,true);
end $$;
revoke all on function public.recordatorios() from public, anon, authenticated;

-- Compartir algo a otra persona desde cualquier lado
create or replace function public.compartir(otro uuid, texto text, adjunto jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  c := public.abrir_directa(otro);
  insert into mensajes(conversacion_id,autor_id,texto,adjunto) values (c,auth.uid(),left(texto,3900),adjunto);
  return c;
end $$;

-- Quién va a qué, para juntar agenda
alter table public.clases add column if not exists sede text;

select cron.schedule('recordatorios-por-hora','0 * * * *','select public.recordatorios()');
