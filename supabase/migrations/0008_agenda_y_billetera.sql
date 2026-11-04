-- ═══════════ Agenda ═══════════
alter table public.eventos drop constraint if exists eventos_tipo_check;
alter table public.eventos add constraint eventos_tipo_check
  check (tipo in ('parcial','final','tp','entrega','clase','estudio','juntada','tramite','vencimiento','personal','otro'));
alter table public.eventos
  add column if not exists fin timestamptz,
  add column if not exists todo_dia boolean not null default false,
  add column if not exists lugar_nombre text,
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists notas text,
  add column if not exists color text,
  add column if not exists repetir text not null default 'no' check (repetir in ('no','diario','semanal','quincenal','mensual')),
  add column if not exists repetir_hasta date,
  add column if not exists excepciones date[] not null default '{}',
  add column if not exists avisos int[] not null default '{1440,60}',
  add column if not exists pasos jsonb not null default '[]',
  add column if not exists importante boolean not null default false,
  add column if not exists viaje_min int,
  add column if not exists origen_id bigint references public.eventos(id) on delete cascade,
  add column if not exists creado_en timestamptz not null default now();
create index if not exists eventos_origen_idx on public.eventos(origen_id);

create table public.evento_invitados (
  evento_id bigint not null references public.eventos(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente','voy','no')),
  creado_en timestamptz not null default now(),
  primary key (evento_id, perfil_id)
);
create index evento_invitados_perfil_idx on public.evento_invitados(perfil_id);
alter table public.evento_invitados enable row level security;

create table public.evento_avisos_enviados (
  evento_id bigint not null references public.eventos(id) on delete cascade,
  cuando timestamptz not null,
  minutos int not null,
  primary key (evento_id, cuando, minutos)
);
alter table public.evento_avisos_enviados enable row level security;

create function public.soy_dueno_evento(e bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from eventos where id=e and perfil_id=auth.uid())
$$;
create function public.soy_invitado(e bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from evento_invitados where evento_id=e and perfil_id=auth.uid())
$$;
revoke all on function public.soy_dueno_evento(bigint), public.soy_invitado(bigint) from public, anon;
grant execute on function public.soy_dueno_evento(bigint), public.soy_invitado(bigint) to authenticated;

drop policy if exists "míos" on public.eventos;
create policy "veo los míos y a los que me invitaron" on public.eventos for select to authenticated
  using (perfil_id=auth.uid() or public.soy_invitado(id));
create policy "creo los míos" on public.eventos for insert to authenticated with check (perfil_id=auth.uid());
create policy "edito los míos" on public.eventos for update to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "borro los míos" on public.eventos for delete to authenticated using (perfil_id=auth.uid());

create policy "ve dueño e invitados" on public.evento_invitados for select to authenticated
  using (perfil_id=auth.uid() or public.soy_dueno_evento(evento_id) or public.soy_invitado(evento_id));
create function public.puedo_invitar(otro uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from perfiles p where p.id=otro and p.grupo_id=public.mi_grupo())
    and not exists(select 1 from bloqueos b where b.perfil_id=otro and b.bloqueado_id=auth.uid())
$$;
revoke all on function public.puedo_invitar(uuid) from public, anon;
grant execute on function public.puedo_invitar(uuid) to authenticated;
create policy "invita el dueño a su grupo" on public.evento_invitados for insert to authenticated
  with check (public.soy_dueno_evento(evento_id) and estado='pendiente' and public.puedo_invitar(perfil_id));
create policy "responde el invitado" on public.evento_invitados for update to authenticated
  using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());
create policy "saca el dueño o se va" on public.evento_invitados for delete to authenticated
  using (perfil_id=auth.uid() or public.soy_dueno_evento(evento_id));

create function public.al_invitar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare e eventos; quien text;
begin
  select * into e from eventos where id=new.evento_id;
  select nombre into quien from perfiles where id=e.perfil_id;
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  values (new.perfil_id,'agenda',quien||' te sumó a '||e.titulo,to_char(e.fecha at time zone 'America/Argentina/Buenos_Aires','DD/MM HH24:MI'),'/agenda?e='||e.id);
  return new;
end $$;
create trigger evento_invitado after insert on public.evento_invitados for each row execute function public.al_invitar();

create function public.al_responder_evento() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare e eventos; quien text;
begin
  if new.estado=old.estado or new.estado='pendiente' then return new; end if;
  select * into e from eventos where id=new.evento_id;
  select nombre into quien from perfiles where id=new.perfil_id;
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  values (e.perfil_id,'agenda',quien||(case when new.estado='voy' then ' va a ' else ' no va a ' end)||e.titulo,null,'/agenda?e='||e.id);
  return new;
end $$;
create trigger evento_respuesta after update of estado on public.evento_invitados for each row execute function public.al_responder_evento();
revoke all on function public.al_invitar(), public.al_responder_evento() from public, anon, authenticated;

-- Resúmenes y apuntes, propios o compartidos con el grupo
create table public.resumenes (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  evento_id bigint references public.eventos(id) on delete set null,
  materia text,
  titulo text not null,
  cuerpo text,
  enlace text check (enlace is null or enlace ~* '^https?://'),
  archivo text,
  compartido boolean not null default false,
  creado_en timestamptz not null default now()
);
create index resumenes_perfil_idx on public.resumenes(perfil_id, creado_en desc);
create index resumenes_evento_idx on public.resumenes(evento_id);
alter table public.resumenes enable row level security;
create policy "veo los míos y los del grupo" on public.resumenes for select to authenticated
  using (perfil_id=auth.uid() or (compartido and grupo_id=public.mi_grupo()));
create policy "sumo los míos" on public.resumenes for insert to authenticated with check (perfil_id=auth.uid() and grupo_id=public.mi_grupo());
create policy "edito los míos" on public.resumenes for update to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid() and grupo_id=public.mi_grupo());
create policy "borro los míos" on public.resumenes for delete to authenticated using (perfil_id=auth.uid());

-- Conexión con otros calendarios
create table public.calendario_enlaces (
  perfil_id uuid primary key references public.perfiles(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24),'hex'),
  creado_en timestamptz not null default now()
);
alter table public.calendario_enlaces enable row level security;
create policy "míos" on public.calendario_enlaces for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

create table public.calendarios_externos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null,
  url text not null check (url ~* '^(https|webcal)://'),
  color text not null default '#1F7AFF',
  creado_en timestamptz not null default now()
);
create index calendarios_externos_perfil_idx on public.calendarios_externos(perfil_id);
alter table public.calendarios_externos enable row level security;
create policy "míos" on public.calendarios_externos for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

-- Lo que leen Google o Apple con el enlace privado de cada persona
create function public.agenda_feed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u uuid;
begin
  if p_token is null or length(p_token)<32 then return null; end if;
  select perfil_id into u from calendario_enlaces where token=p_token;
  if u is null then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'titulo',e.titulo,'tipo',e.tipo,'fecha',e.fecha,'fin',e.fin,'todo_dia',e.todo_dia,
      'lugar',e.lugar_nombre,'notas',e.notas,'repetir',e.repetir,'hasta',e.repetir_hasta,'excepciones',e.excepciones))
    from eventos e
    where not e.hecho and (e.perfil_id=u or exists(select 1 from evento_invitados i where i.evento_id=e.id and i.perfil_id=u and i.estado<>'no'))),'[]'::jsonb);
end $$;
revoke all on function public.agenda_feed(text) from public;
grant execute on function public.agenda_feed(text) to anon, authenticated;

-- Fechas en las que cae un evento dentro de una ventana
create function public.ocurrencias(e public.eventos, desde timestamptz, hasta timestamptz) returns setof timestamptz
language plpgsql stable set search_path = public, pg_temp as $$
declare paso interval; t timestamptz; tope timestamptz; n int := 0;
begin
  if e.repetir='no' then
    if e.fecha>=desde and e.fecha<=hasta then return next e.fecha; end if;
    return;
  end if;
  paso := case e.repetir when 'diario' then interval '1 day' when 'semanal' then interval '7 days' when 'quincenal' then interval '14 days' else interval '1 month' end;
  tope := least(hasta, coalesce((e.repetir_hasta+1)::timestamptz, hasta));
  while n<1500 loop
    t := e.fecha + paso*n;
    exit when t>tope;
    if t>=desde and not ((t at time zone 'America/Argentina/Buenos_Aires')::date = any(e.excepciones)) then return next t; end if;
    n := n+1;
  end loop;
end $$;
revoke all on function public.ocurrencias(public.eventos,timestamptz,timestamptz) from public, anon, authenticated;

create function public.frase_faltan(m int) returns text language sql immutable as $$
  select case when m<60 then 'en '||m||' minutos' when m<1440 then 'en '||(m/60)||(case when m/60=1 then ' hora' else ' horas' end)
    when m=1440 then 'mañana' else 'en '||(m/1440)||' días' end
$$;

-- Corre cada 5 minutos: todos los avisos de la agenda
create function public.agenda_avisos() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e eventos; t timestamptz; m int; momento timestamptz; dest uuid;
begin
  for e in select ev.* from eventos ev join perfiles p on p.id=ev.perfil_id
    where not ev.hecho and coalesce((p.notif->>'agenda')::boolean,true) and (ev.repetir<>'no' or ev.fecha>now()-interval '10 minutes')
  loop
    for t in select * from ocurrencias(e, now()-interval '10 minutes', now()+interval '31 days') loop
      foreach m in array (e.avisos || (case when e.viaje_min is not null then array[-(e.viaje_min+15)] else '{}'::int[] end)) loop
        momento := (case when e.todo_dia then t+interval '9 hours' else t end) - make_interval(mins => abs(m));
        if momento<=now() and momento>now()-interval '10 minutes' then
          begin
            insert into evento_avisos_enviados(evento_id,cuando,minutos) values (e.id,t,m);
          exception when unique_violation then continue;
          end;
          for dest in select e.perfil_id union select i.perfil_id from evento_invitados i where i.evento_id=e.id and i.estado<>'no' loop
            insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace) values (dest,'agenda',
              case when m<0 then 'Salí en 15 minutos: '||e.titulo else initcap(frase_faltan(m))||': '||e.titulo end,
              case when m<0 then coalesce('Para llegar a '||e.lugar_nombre,'Para llegar a tiempo')
                   else to_char(t at time zone 'America/Argentina/Buenos_Aires','DD/MM')||(case when e.todo_dia then '' else ' a las '||to_char(t at time zone 'America/Argentina/Buenos_Aires','HH24:MI') end)||coalesce(' en '||e.lugar_nombre,'') end,
              '/agenda?e='||e.id);
          end loop;
        end if;
      end loop;
    end loop;
  end loop;
  delete from evento_avisos_enviados where cuando<now()-interval '60 days';
end $$;

-- Corre a la mañana: qué tenés hoy
create function public.agenda_manana() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; n int; primero text;
  ini timestamptz := date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
begin
  for p in select id from perfiles where coalesce((notif->>'agenda')::boolean,true) loop
    select count(*), min(x.titulo) into n, primero from (
      select e.titulo from eventos e, lateral ocurrencias(e, ini, ini+interval '1 day') o
      where e.perfil_id=p.id and not e.hecho order by o) x;
    if n>0 then
      insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
      values (p.id,'agenda',case when n=1 then 'Hoy tenés 1 cosa' else 'Hoy tenés '||n||' cosas' end, primero, '/agenda');
    end if;
  end loop;
end $$;

-- El aviso viejo de fechas pasa a la agenda; quedan las juntadas
create or replace function public.recordatorios() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace)
  select r.perfil_id,'juntada','En dos horas: '||j.titulo,j.lugar_nombre,'/gente/juntadas'
  from juntadas j join juntada_respuestas r on r.juntada_id=j.id and r.estado='voy' join perfiles p on p.id=r.perfil_id
  where j.cuando between now()+interval '1 hour' and now()+interval '2 hours'
    and j.cuando-interval '2 hours' between now()-interval '1 hour' and now()
    and coalesce((p.notif->>'juntadas')::boolean,true);
end $$;

-- ═══════════ Billetera ═══════════
create table public.plata_categorias (
  id bigint generated always as identity primary key,
  perfil_id uuid references public.perfiles(id) on delete cascade,  -- null: para todos
  tipo text not null check (tipo in ('gasto','ingreso')),
  nombre text not null,
  emoji text not null default '💸',
  color text not null default '#8E8E93',
  tope numeric(14,2),
  orden int not null default 100
);
create unique index plata_categorias_unica on public.plata_categorias(coalesce(perfil_id,'00000000-0000-0000-0000-000000000000'), tipo, nombre);
alter table public.plata_categorias enable row level security;
create policy "veo las comunes y las mías" on public.plata_categorias for select to authenticated using (perfil_id is null or perfil_id=auth.uid());
create policy "edito las mías" on public.plata_categorias for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

insert into public.plata_categorias(tipo,nombre,emoji,color,orden) values
 ('gasto','Súper','🛒','#14B86A',1),('gasto','Comida afuera','🍕','#FF8A1F',2),('gasto','Salidas','🍻','#FF4D8D',3),
 ('gasto','Transporte','🚌','#1F7AFF',4),('gasto','Facu','📚','#7C5CFC',5),('gasto','Alquiler y expensas','🏠','#B7791F',6),
 ('gasto','Servicios','💡','#E0B100',7),('gasto','Salud','💊','#E5484D',8),('gasto','Ropa','👕','#0FB5AE',9),
 ('gasto','Suscripciones','📺','#8E5CF7',10),('gasto','Regalos','🎁','#F76B9B',11),('gasto','Otros','💸','#8E8E93',12),
 ('ingreso','Sueldo','💼','#14B86A',1),('ingreso','Papás','🏡','#1F7AFF',2),('ingreso','Changa','🛠️','#FF8A1F',3),
 ('ingreso','Beca','🎓','#7C5CFC',4),('ingreso','Venta','🏷️','#0FB5AE',5),('ingreso','Regalo','🎁','#F76B9B',6),('ingreso','Otros','💰','#8E8E93',7);

create table public.fijos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null default 'gasto' check (tipo in ('gasto','ingreso')),
  nombre text not null,
  monto numeric(14,2) not null check (monto>0),
  categoria text not null,
  dia int not null default 1 check (dia between 1 and 31),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index fijos_perfil_idx on public.fijos(perfil_id);
alter table public.fijos enable row level security;
create policy "míos" on public.fijos for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

create table public.movimientos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('gasto','ingreso')),
  monto numeric(14,2) not null check (monto>0),
  categoria text not null,
  fecha date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  nota text,
  medio text check (medio in ('efectivo','debito','credito','billetera')),
  fijo_id bigint references public.fijos(id) on delete set null,
  creado_en timestamptz not null default now()
);
create index movimientos_perfil_idx on public.movimientos(perfil_id, fecha desc);
create unique index movimientos_fijo_mes on public.movimientos(fijo_id, date_trunc('month', fecha::timestamp)) where fijo_id is not null;
alter table public.movimientos enable row level security;
create policy "míos" on public.movimientos for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

insert into public.movimientos(perfil_id,tipo,monto,categoria,fecha,nota)
select perfil_id,'gasto',monto,categoria,fecha,nota from public.gastos;

create table public.metas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null,
  emoji text not null default '🎯',
  objetivo numeric(14,2) not null check (objetivo>0),
  ahorrado numeric(14,2) not null default 0 check (ahorrado>=0),
  limite date,
  creado_en timestamptz not null default now()
);
create index metas_perfil_idx on public.metas(perfil_id);
alter table public.metas enable row level security;
create policy "míos" on public.metas for all to authenticated using (perfil_id=auth.uid()) with check (perfil_id=auth.uid());

create table public.consejos_enviados (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  clave text not null,
  creado_en timestamptz not null default now(),
  primary key (perfil_id, clave)
);
alter table public.consejos_enviados enable row level security;

create function public.consejo(p uuid, clave text, titulo text, cuerpo text, enlace text default '/billetera') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into consejos_enviados(perfil_id,clave) values (p,clave) on conflict do nothing;
  if found then insert into notificaciones(perfil_id,tipo,titulo,cuerpo,enlace) values (p,'plata',titulo,cuerpo,enlace); end if;
end $$;
revoke all on function public.consejo(uuid,text,text,text,text) from public, anon, authenticated;

create function public.pesos_txt(n numeric) returns text language sql immutable as $$
  select '$'||replace(to_char(round(n),'FM999,999,999,990'),',','.')
$$;

-- Corre cada noche: anota los fijos y manda los consejos del día
create function public.plata_diaria() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  mes date := date_trunc('month',hoy)::date;
  ult int := extract(day from (mes+interval '1 month'-interval '1 day'))::int;
  dhoy int := extract(day from hoy)::int;
  clave_mes text := to_char(hoy,'YYYY-MM');
  f fijos; p record; c record;
  gastado numeric; ingresos numeric; tope numeric; antes numeric; ultimo date; hizo_fijos int;
begin
  for f in select * from fijos x where x.activo and least(x.dia,ult)=dhoy loop
    insert into movimientos(perfil_id,tipo,monto,categoria,fecha,nota,fijo_id)
    values (f.perfil_id,f.tipo,f.monto,f.categoria,hoy,f.nombre,f.id) on conflict do nothing;
  end loop;

  for p in select id, preferencias, notif from perfiles where coalesce((notif->>'plata')::boolean,true) loop
    select coalesce(sum(monto) filter (where tipo='gasto'),0), coalesce(sum(monto) filter (where tipo='ingreso'),0), max(creado_en)::date
      into gastado, ingresos, ultimo from movimientos where perfil_id=p.id and fecha>=mes and fecha<=hoy;
    tope := nullif((p.preferencias->>'presupuesto')::numeric,0);

    for f in select * from fijos x where x.perfil_id=p.id and x.activo and x.tipo='gasto' and least(x.dia,ult)=dhoy+1 loop
      perform consejo(p.id,'fijo-'||f.id||'-'||clave_mes,'Mañana se anota '||f.nombre,pesos_txt(f.monto)||'. Fijate que tengas la plata.');
    end loop;

    if tope is not null then
      if gastado>=tope then
        perform consejo(p.id,'tope-100-'||clave_mes,'Te pasaste del presupuesto',
          'Gastaste '||pesos_txt(gastado)||' de '||pesos_txt(tope)||' y faltan '||(ult-dhoy)||' días.');
      elsif gastado>=tope*.8 then
        perform consejo(p.id,'tope-80-'||clave_mes,'Ya usaste el 80% del presupuesto',
          'Te quedan '||pesos_txt(tope-gastado)||': unos '||pesos_txt((tope-gastado)/greatest(ult-dhoy+1,1))||' por día hasta fin de mes.');
      end if;
    end if;

    for c in select m.categoria, sum(m.monto) total, cat.tope from movimientos m
        join plata_categorias cat on cat.nombre=m.categoria and cat.tipo='gasto' and cat.perfil_id=p.id and cat.tope is not null
        where m.perfil_id=p.id and m.tipo='gasto' and m.fecha>=mes and m.fecha<=hoy group by 1,3 having sum(m.monto)>=cat.tope*.9 loop
      perform consejo(p.id,'cat-'||c.categoria||'-'||clave_mes,c.categoria||' está por llegar al tope',pesos_txt(c.total)||' de '||pesos_txt(c.tope)||' este mes.');
    end loop;

    select coalesce(sum(monto),0) into antes from movimientos
      where perfil_id=p.id and tipo='gasto' and fecha>=mes-interval '1 month' and fecha<=hoy-interval '1 month';
    if dhoy>=10 and antes>0 and gastado>antes*1.2 then
      perform consejo(p.id,'ritmo-'||clave_mes,'Vas gastando más que el mes pasado',
        pesos_txt(gastado-antes)||' más que a esta altura del mes anterior.');
    end if;

    if ultimo is not null and ultimo<=hoy-3 then
      perform consejo(p.id,'anotar-'||to_char(hoy,'YYYY-MM-DD'),'¿Gastaste algo estos días?','Hace 3 días que no anotás nada. Tocá dos veces Billetera y listo.');
    end if;

    if extract(isodow from hoy)=7 and gastado>0 then
      perform consejo(p.id,'semana-'||to_char(hoy,'IYYY-IW'),'Tu semana en plata',
        'Gastaste '||pesos_txt((select coalesce(sum(monto),0) from movimientos where perfil_id=p.id and tipo='gasto' and fecha>hoy-7 and fecha<=hoy))||' en los últimos 7 días.','/billetera?v=numeros');
    end if;

    if dhoy=ult and (gastado>0 or ingresos>0) then
      perform consejo(p.id,'cierre-'||clave_mes,'Cerraste el mes',
        case when ingresos>=gastado then 'Te quedaron '||pesos_txt(ingresos-gastado)||'.' else 'Gastaste '||pesos_txt(gastado-ingresos)||' más de lo que entró.' end,'/billetera?v=numeros');
    end if;
  end loop;
end $$;
revoke all on function public.agenda_avisos(), public.agenda_manana(), public.plata_diaria() from public, anon, authenticated;
revoke all on function public.frase_faltan(int), public.pesos_txt(numeric) from public, anon, authenticated;
