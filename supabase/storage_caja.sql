-- Bucket privado de Mi caja. Cada persona solo toca su carpeta: <perfil_id>/archivo.
-- Se aplica aparte de las migraciones y solo si el proyecto tiene Storage.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit) values ('caja','caja',false,26214400)
      on conflict (id) do update set public=false, file_size_limit=26214400;
    execute $p$drop policy if exists "caja veo lo mío" on storage.objects$p$;
    execute $p$drop policy if exists "caja subo lo mío" on storage.objects$p$;
    execute $p$drop policy if exists "caja cambio lo mío" on storage.objects$p$;
    execute $p$drop policy if exists "caja borro lo mío" on storage.objects$p$;
    execute $p$create policy "caja veo lo mío" on storage.objects for select to authenticated using (bucket_id='caja' and (storage.foldername(name))[1]=auth.uid()::text)$p$;
    execute $p$create policy "caja subo lo mío" on storage.objects for insert to authenticated with check (bucket_id='caja' and (storage.foldername(name))[1]=auth.uid()::text)$p$;
    execute $p$create policy "caja cambio lo mío" on storage.objects for update to authenticated using (bucket_id='caja' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='caja' and (storage.foldername(name))[1]=auth.uid()::text)$p$;
    execute $p$create policy "caja borro lo mío" on storage.objects for delete to authenticated using (bucket_id='caja' and (storage.foldername(name))[1]=auth.uid()::text)$p$;
  end if;
end $$;
