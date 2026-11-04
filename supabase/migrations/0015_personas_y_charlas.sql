-- Lo que la app pide al abrir: tamaño fijo aunque el grupo tenga 10.000 personas.
set lock_timeout = '5s';

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
