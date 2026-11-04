-- Índices para que la app aguante 10.000 personas.
-- Las tablas de producción hoy casi no tienen filas: cada índice tarda milisegundos.
-- Si esto se aplica con mucha carga, conviene usar CREATE INDEX CONCURRENTLY fuera de una transacción.
set lock_timeout = '5s';

-- ───── Claves foráneas sin índice ─────
-- Borrar una persona arrastra filas de unas 30 tablas: sin estos índices, cada una se recorre entera.
create index if not exists aportes_autor_idx on public.aportes(autor_id);
create index if not exists apuntes_autor_idx on public.apuntes(autor_id);
create index if not exists apuntes_grupo_idx on public.apuntes(grupo_id, creado_en desc);
create index if not exists bloqueos_bloqueado_idx on public.bloqueos(bloqueado_id, perfil_id);
create index if not exists caja_categorias_perfil_idx on public.caja_categorias(perfil_id);
create index if not exists clases_perfil_idx on public.clases(perfil_id, dia, hora_inicio);
create index if not exists clases_materia_idx on public.clases(materia_id);
create index if not exists clases_lugar_idx on public.clases(lugar_id);
create index if not exists conversaciones_grupo_idx on public.conversaciones(grupo_id, tipo);
create index if not exists cuenta_gastos_cuenta_idx on public.cuenta_gastos(cuenta_id, creado_en);
create index if not exists cuenta_gastos_pago_idx on public.cuenta_gastos(pago_id);
create index if not exists cuentas_creada_por_idx on public.cuentas(creada_por);
create index if not exists cuentas_grupo_idx on public.cuentas(grupo_id, creado_en desc);
create index if not exists eventos_materia_idx on public.eventos(materia_id);
create index if not exists guardados_item_idx on public.guardados(item_id);
create index if not exists guia_items_creado_por_idx on public.guia_items(creado_por);
create index if not exists guia_items_grupo_idx on public.guia_items(grupo_id);
create index if not exists juntada_respuestas_perfil_idx on public.juntada_respuestas(perfil_id);
create index if not exists juntadas_creada_por_idx on public.juntadas(creada_por);
create index if not exists juntadas_grupo_idx on public.juntadas(grupo_id, cuando);
create index if not exists lugares_grupo_idx on public.lugares(grupo_id);
create index if not exists materia_correlativas_requiere_idx on public.materia_correlativas(requiere_id);
create index if not exists materias_perfil_idx on public.materias(perfil_id, creado_en);
create index if not exists mazos_materia_idx on public.mazos(materia_id);
create index if not exists mensajes_autor_idx on public.mensajes(autor_id);
create index if not exists perfiles_carrera_idx on public.perfiles(carrera_id);
create index if not exists perfiles_universidad_idx on public.perfiles(universidad_id);
create index if not exists plata_categorias_perfil_idx on public.plata_categorias(perfil_id);
create index if not exists progreso_items_item_idx on public.progreso_items(item_id);
create index if not exists resumenes_grupo_idx on public.resumenes(grupo_id, creado_en desc);
create index if not exists compra_listas_grupo_todas_idx on public.compra_listas(grupo_id);
create index if not exists movimientos_fijo_idx on public.movimientos(fijo_id);
create index if not exists sesiones_foco_materia_idx on public.sesiones_foco(materia_id);
create index if not exists suscripciones_push_perfil_idx on public.suscripciones_push(perfil_id);
create index if not exists tarea_listas_grupo_idx on public.tarea_listas(grupo_id);
create index if not exists tareas_hecha_por_idx on public.tareas(hecha_por);

-- ───── Filtros frecuentes ─────
-- El globito de avisos: cuenta solo lo que falta leer de cada persona.
create index if not exists notif_sin_leer_idx on public.notificaciones(perfil_id) where not leida;
-- Las que recorren los recordatorios y la lista de gente.
create index if not exists juntadas_cuando_idx on public.juntadas(cuando);
create index if not exists perfiles_grupo_nombre_idx on public.perfiles(grupo_id, nombre);
create index if not exists eventos_repetidos_idx on public.eventos(perfil_id) where repetir <> 'no' and not hecho;
-- Cuentas compartidas: cada persona encuentra las suyas sin recorrer las de todo el grupo.
create index if not exists cuentas_miembros_idx on public.cuentas using gin(miembros);
-- Abrir un archivo compartido busca su resumen por ruta.
create index if not exists resumenes_archivo_idx on public.resumenes(archivo) where archivo is not null;
-- Limpiezas nocturnas. BRIN pesa casi nada y sirve porque las filas entran en orden de fecha.
create index if not exists notif_creado_brin on public.notificaciones using brin(creado_en);
create index if not exists evento_avisos_cuando_idx on public.evento_avisos_enviados(cuando);
create index if not exists consejos_enviados_creado_idx on public.consejos_enviados(creado_en);
