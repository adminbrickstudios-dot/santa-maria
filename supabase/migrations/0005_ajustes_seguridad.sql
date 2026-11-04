alter function public.normalizar_usuario(text) set search_path = public;
revoke execute on function public.mi_grupo(), public.soy_admin(), public.soy_miembro(uuid) from public, anon;
revoke execute on function public.push_datos(bigint,text), public.push_borrar(bigint,text) from authenticated;
