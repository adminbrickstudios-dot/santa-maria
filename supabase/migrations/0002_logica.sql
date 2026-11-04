create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ───── Alta de cuentas ─────
create or replace function public.crear_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
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
    coalesce(m->>'color','#0B4F9E'),coalesce(m->>'rol','miembro'),(m->>'lat')::double precision,(m->>'lon')::double precision,m->>'barrio');
  insert into conversacion_miembros(conversacion_id,perfil_id)
    select id,new.id from conversaciones where grupo_id=g and tipo='grupo' on conflict do nothing;
  return new;
end $$;
create trigger al_crear_usuario after insert on auth.users for each row execute function public.crear_perfil_nuevo();

create or replace function public.usuario_disponible(u text) returns boolean
language sql stable security definer set search_path = public as $$ select not exists(select 1 from perfiles where usuario = normalizar_usuario(u)) $$;

-- Un miembro no puede cambiarse el rol ni el grupo por su cuenta.
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.soy_admin() then
    new.rol := old.rol; new.grupo_id := old.grupo_id; new.usuario := old.usuario;
  end if;
  return new;
end $$;
create trigger perfil_protegido before update on public.perfiles for each row execute function public.proteger_perfil();

create or replace function public.clave_cambiada() returns void
language sql security definer set search_path = public as $$ update perfiles set debe_cambiar_clave=false where id=auth.uid() $$;

-- Gente del grupo: la casa se muestra según lo que cada uno eligió.
create or replace function public.personas_del_grupo()
returns table(id uuid,usuario text,nombre text,avatar_url text,color text,bio text,ciudad_origen text,universidad_id text,carrera_texto text,anio_cursada int,barrio text,lat double precision,lon double precision,rol text)
language sql stable security definer set search_path = public as $$
  select p.id,p.usuario,p.nombre,p.avatar_url,p.color,p.bio,p.ciudad_origen,p.universidad_id,p.carrera_texto,p.anio_cursada,
    case when p.casa_visibilidad='oculta' and p.id<>auth.uid() then null else p.casa_barrio end,
    case when p.casa_visibilidad='exacta' or p.id=auth.uid() then p.casa_lat end,
    case when p.casa_visibilidad='exacta' or p.id=auth.uid() then p.casa_lon end,
    p.rol
  from perfiles p where p.grupo_id = public.mi_grupo() order by p.nombre
$$;

-- ───── Mensajes ─────
create or replace function public.soy_miembro(c uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists(select 1 from conversacion_miembros where conversacion_id=c and perfil_id=auth.uid()) $$;

create or replace function public.abrir_directa(otro uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare yo uuid := auth.uid(); g uuid := public.mi_grupo(); cl text; c uuid;
begin
  if yo is null or otro = yo then raise exception 'no_valido'; end if;
  if not exists(select 1 from perfiles where id=otro and grupo_id=g) then raise exception 'otro_grupo'; end if;
  cl := least(yo::text,otro::text)||':'||greatest(yo::text,otro::text);
  select id into c from conversaciones where clave_directa=cl;
  if c is null then
    insert into conversaciones(grupo_id,tipo,clave_directa) values (g,'directa',cl) returning id into c;
    insert into conversacion_miembros(conversacion_id,perfil_id) values (c,yo),(c,otro);
  end if;
  return c;
end $$;

create or replace function public.marcar_leido(c uuid) returns void
language sql security definer set search_path = public as $$
  update conversacion_miembros set ultimo_leido_en=now() where conversacion_id=c and perfil_id=auth.uid();
  update notificaciones set leida=true where perfil_id=auth.uid() and enlace='/gente/chat/'||c::text and not leida;
$$;

create or replace function public.mis_conversaciones()
returns table(id uuid,tipo text,titulo text,ultimo_en timestamptz,ultimo_texto text,sin_leer bigint,otro_id uuid,otro_nombre text,otro_color text,otro_avatar text)
language sql stable security definer set search_path = public as $$
  select c.id,c.tipo,c.titulo,c.ultimo_en,c.ultimo_texto,
    (select count(*) from mensajes m where m.conversacion_id=c.id and m.creado_en>cm.ultimo_leido_en and m.autor_id<>auth.uid()),
    o.id,o.nombre,o.color,o.avatar_url
  from conversacion_miembros cm join conversaciones c on c.id=cm.conversacion_id
  left join lateral (select p.* from conversacion_miembros x join perfiles p on p.id=x.perfil_id
     where c.tipo='directa' and x.conversacion_id=c.id and x.perfil_id<>auth.uid() limit 1) o on true
  where cm.perfil_id=auth.uid() order by c.ultimo_en desc
$$;

create or replace function public.al_mensaje() returns trigger
language plpgsql security definer set search_path = public as $$
declare c conversaciones; a perfiles; r record;
begin
  select * into c from conversaciones where id=new.conversacion_id;
  select * into a from perfiles where id=new.autor_id;
  update conversaciones set ultimo_en=new.creado_en, ultimo_texto=left(new.texto,120) where id=c.id;
  for r in select cm.perfil_id from conversacion_miembros cm join perfiles p on p.id=cm.perfil_id
    where cm.conversacion_id=c.id and cm.perfil_id<>new.autor_id and not cm.silenciada and coalesce((p.notif->>'mensajes')::boolean,true)
      and not exists(select 1 from bloqueos b where b.perfil_id=cm.perfil_id and b.bloqueado_id=new.autor_id)
  loop
    insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
    values (r.perfil_id,'mensaje',case when c.tipo='grupo' then coalesce(c.titulo,'Grupo')||': '||a.nombre else a.nombre end,left(new.texto,140),'/gente/chat/'||c.id::text);
  end loop;
  return new;
end $$;
create trigger mensaje_nuevo after insert on public.mensajes for each row execute function public.al_mensaje();

-- ───── Avisos automáticos ─────
create or replace function public.al_juntada() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text;
begin
  select nombre into a from perfiles where id=new.creada_por;
  insert into juntada_respuestas(juntada_id,perfil_id,estado) values (new.id,new.creada_por,'voy');
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select p.id,'juntada',a||' propuso una juntada',new.titulo||coalesce(' en '||new.lugar_nombre,''),'/gente/juntadas'
  from perfiles p where p.grupo_id=new.grupo_id and p.id<>new.creada_por and coalesce((p.notif->>'juntadas')::boolean,true);
  return new;
end $$;
create trigger juntada_nueva after insert on public.juntadas for each row execute function public.al_juntada();

create or replace function public.al_aporte() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text;
begin
  if new.tipo not in ('aviso','salida','pedido') then return new; end if;
  select nombre into a from perfiles where id=new.autor_id;
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select p.id,'aviso',a||': '||new.titulo,new.nota,'/gente'
  from perfiles p where p.grupo_id=new.grupo_id and p.id<>new.autor_id and coalesce((p.notif->>'avisos')::boolean,true);
  return new;
end $$;
create trigger aporte_nuevo after insert on public.aportes for each row execute function public.al_aporte();

-- Dispara el envío push cuando están cargados la URL y el secreto (config_interna).
create or replace function public.despachar_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  select valor into u from config_interna where clave='push_url';
  select valor into s from config_interna where clave='push_secreto';
  if u is null or s is null or to_regclass('net.http_request_queue') is null then return new; end if;
  execute 'select net.http_post(url:=$1, body:=$2, headers:=$3)' using u, jsonb_build_object('notificacion_id',new.id), jsonb_build_object('Content-Type','application/json','x-secreto',s);
  return new;
exception when others then return new;
end $$;
create trigger notif_push after insert on public.notificaciones for each row execute function public.despachar_push();

-- ───── Búsqueda en la guía ─────
create or replace function public.buscar_guia(q text)
returns setof public.guia_items language sql stable security definer set search_path = public as $$
  select * from guia_items
  where publicado and (grupo_id is null or grupo_id=public.mi_grupo())
    and (busqueda @@ websearch_to_tsquery('spanish',q) or titulo ilike '%'||q||'%')
  order by ts_rank(busqueda,websearch_to_tsquery('spanish',q)) desc limit 40
$$;
