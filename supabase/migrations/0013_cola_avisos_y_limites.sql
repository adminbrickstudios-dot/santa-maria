-- Registro de errores, cupos por persona, cola de push y avisos que no frenan a quien escribe.
set lock_timeout = '5s';

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
  if auth.uid() is null then return false; end if;
  return public.cupo_interno(left(p_accion,30)||':'||auth.uid(),p_por_minuto,p_por_dia);
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
  select p.id,'aviso',a||': '||new.titulo,new.nota,'/gente'
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

-- Registro abierto: cupo por dirección de red para que nadie cree miles de cuentas con un script.
-- La dirección se guarda como hash y se borra sola a los 3 días. Permite a un aula entera detrás de una misma red.
create or replace function public.registrar_usuario(p_usuario text, p_nombre text, p_clave text, p_codigo text default null)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u text := public.normalizar_usuario(p_usuario); correo text; uid uuid := gen_random_uuid(); ip text;
begin
  if length(u) < 3 or length(u) > 24 then return 'usuario_invalido'; end if;
  if length(coalesce(p_clave,'')) < 8 then return 'clave_corta'; end if;
  ip := nullif(trim(split_part(coalesce((nullif(current_setting('request.headers',true),'')::json)->>'x-forwarded-for',''),',',1)),'');
  if ip is not null and not public.cupo_interno('registro:'||md5(ip),15,150) then return 'muchos_intentos'; end if;
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
