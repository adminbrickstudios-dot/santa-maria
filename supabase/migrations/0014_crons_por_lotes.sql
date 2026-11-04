-- Los procesos automáticos dejan de recorrer a todos de un golpe.
-- agenda_avisos solo mira lo que vence; agenda_manana y plata_diaria avanzan de a tandas y retoman donde quedaron.
set lock_timeout = '5s';

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
language plpgsql set search_path = public, pg_temp as $$
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
