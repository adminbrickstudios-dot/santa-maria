-- Deja este repo igual a lo que ya corre en producción.
-- Un bloqueo también frena lo que se manda desde la guía o el mapa.
create or replace function public.compartir(otro uuid, texto text, adjunto jsonb default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c uuid;
begin
  if exists(select 1 from bloqueos where perfil_id=otro and bloqueado_id=auth.uid()) then raise exception 'bloqueado'; end if;
  c := public.abrir_directa(otro);
  insert into mensajes(conversacion_id,autor_id,texto,adjunto) values (c,auth.uid(),left(texto,3900),adjunto);
  return c;
end $function$;

-- Las funciones de sesión no son para visitantes sin cuenta.
revoke execute on function
  public.abrir_directa(uuid), public.admin_cuentas(), public.admin_poner_mail(uuid,text),
  public.admin_resetear_clave(uuid), public.buscar_guia(text), public.clave_cambiada(),
  public.compartir(uuid,text,jsonb), public.marcar_leido(uuid), public.mis_conversaciones(),
  public.personas_del_grupo()
from public, anon;

-- Los disparadores no se llaman a mano.
revoke execute on function
  public.al_aporte(), public.al_juntada(), public.al_mensaje(),
  public.despachar_push(), public.proteger_perfil()
from public, anon, authenticated;
