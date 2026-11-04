-- Tipos permitidos y cupo por persona en los archivos privados.
-- Mantiene el tope de 25 MB por archivo que ya promete la app. El cupo cuenta lo que ya subió cada uno.
-- Se saltea entero si el proyecto no tiene Storage.
set lock_timeout = '5s';

create function public.dentro_de_cupo_archivos() returns boolean
language plpgsql stable security definer set search_path = public, storage, pg_temp as $$
declare u text := auth.uid()::text; total bigint; cantidad int;
begin
  if u is null then return false; end if;
  -- El índice (bucket_id, name COLLATE "C") hace que esto lea solo la carpeta de la persona.
  select coalesce(sum((o.metadata->>'size')::bigint),0), count(*) into total, cantidad
  from storage.objects o
  where o.bucket_id in ('caja','resumenes')
    and o.name collate "C" >= u||'/' and o.name collate "C" < u||'0';
  return total<524288000 and cantidad<1000;  -- 500 MB y 1.000 archivos por persona
end $$;
revoke all on function public.dentro_de_cupo_archivos() from public, anon;
grant execute on function public.dentro_de_cupo_archivos() to authenticated;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    -- Nunca SVG ni HTML: se pueden abrir como página y ejecutar código.
    update storage.buckets set file_size_limit=26214400, allowed_mime_types=array['image/png','image/jpeg','image/webp','image/heic','image/heif','image/gif','application/pdf','text/plain','text/csv','application/zip','application/octet-stream','audio/mpeg','audio/mp4','video/mp4',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ] where id in ('caja','resumenes');

  end if;
  -- Estas políticas viven en producción; en una base nueva recién aparecen con storage_caja.sql.
  if exists(select 1 from pg_policies where schemaname='storage' and policyname='caja subo lo mío') then
    alter policy "caja subo lo mío" on storage.objects
      with check (bucket_id='caja' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.dentro_de_cupo_archivos()));
    alter policy "caja veo lo mío" on storage.objects
      using (bucket_id='caja' and (storage.foldername(name))[1]=(select auth.uid())::text);
    alter policy "caja cambio lo mío" on storage.objects
      using (bucket_id='caja' and (storage.foldername(name))[1]=(select auth.uid())::text)
      with check (bucket_id='caja' and (storage.foldername(name))[1]=(select auth.uid())::text);
    alter policy "caja borro lo mío" on storage.objects
      using (bucket_id='caja' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
  if exists(select 1 from pg_policies where schemaname='storage' and policyname='resumenes sube el dueño') then
    alter policy "resumenes sube el dueño" on storage.objects
      with check (bucket_id='resumenes' and (storage.foldername(name))[1]=(select auth.uid())::text and (select public.dentro_de_cupo_archivos()));
    alter policy "resumenes borra el dueño" on storage.objects
      using (bucket_id='resumenes' and (storage.foldername(name))[1]=(select auth.uid())::text);
    alter policy "resumenes lee dueño o grupo" on storage.objects
      using (bucket_id='resumenes' and ((storage.foldername(name))[1]=(select auth.uid())::text
        or exists(select 1 from public.resumenes r where r.archivo=objects.name and r.compartido and r.grupo_id=(select public.mi_grupo()))));
  end if;
end $$;
