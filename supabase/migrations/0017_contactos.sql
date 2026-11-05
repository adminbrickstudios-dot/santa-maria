-- Un solo grupo grande: se ven en la lista, pero solo se escriben si aceptan el contacto.
-- Solo cambia algo en un grupo masivo (más de umbral_masivo() personas). Un grupo de amigos sigue igual.
-- Las charlas directas que ya existen quedan como contacto aceptado: nadie pierde una conversación.
set lock_timeout = '5s';

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
