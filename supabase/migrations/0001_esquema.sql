-- Santa María: esquema base. Todo en español, multi-grupo y con RLS desde el día 1.

create or replace function public.normalizar_usuario(t text) returns text
language sql immutable as $$ select regexp_replace(lower(translate(coalesce(t,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunaeiouun')),'[^a-z0-9]','','g') $$;

-- ───── Grupos (el "negocio" de este sistema) ─────
create table public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  codigo_invitacion text not null unique,
  abierto boolean not null default false,      -- true: cualquiera entra sin código
  pantallas jsonb not null default '{"inicio":true,"mapa":true,"guia":true,"facu":true,"gente":true,"mensajes":true,"juntadas":true,"cuentas":true,"apuntes":true,"presupuesto":true,"carreras":true}',
  marca jsonb not null default '{}',           -- paleta y logo por grupo
  creado_en timestamptz not null default now()
);

create table public.universidades (
  id text primary key,
  nombre text not null,
  tipo text not null check (tipo in ('publica','privada')),
  sedes jsonb not null default '[]',
  ingreso text,
  costo text,
  enlace text,
  fuente_url text
);

create table public.carreras (
  id bigint generated always as identity primary key,
  universidad_id text not null references public.universidades(id) on delete cascade,
  facultad text,
  nombre text not null,
  titulo text,
  duracion text,
  sede text,
  area text not null,
  modalidad text,
  enlace text,
  fuente_url text
);
create index carreras_area_idx on public.carreras(area);
create index carreras_uni_idx on public.carreras(universidad_id);

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id),
  usuario text not null unique,
  nombre text not null,
  email_contacto text,
  avatar_url text,
  color text not null default '#0B4F9E',
  rol text not null default 'miembro' check (rol in ('miembro','admin')),
  debe_cambiar_clave boolean not null default false,
  bio text,
  ciudad_origen text,
  universidad_id text references public.universidades(id),
  carrera_id bigint references public.carreras(id),
  carrera_texto text,
  anio_cursada int,
  casa_lat double precision,
  casa_lon double precision,
  casa_barrio text,
  casa_visibilidad text not null default 'exacta' check (casa_visibilidad in ('exacta','barrio','oculta')),
  tema text not null default 'auto' check (tema in ('auto','claro','oscuro')),
  preferencias jsonb not null default '{"bici":false,"presupuesto":0}',
  notif jsonb not null default '{"mensajes":true,"juntadas":true,"avisos":true,"facu":true,"descuentos":false}',
  test_resultado jsonb,
  onboarding_hecho boolean not null default false,
  creado_en timestamptz not null default now(),
  ultimo_acceso timestamptz
);
create index perfiles_grupo_idx on public.perfiles(grupo_id);

create or replace function public.mi_grupo() returns uuid
language sql stable security definer set search_path = public as $$ select grupo_id from public.perfiles where id = auth.uid() $$;
create or replace function public.soy_admin() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce((select rol='admin' from public.perfiles where id = auth.uid()),false) $$;

-- ───── Guía ─────
create table public.secciones_guia (
  slug text primary key,
  bloque text not null,      -- arrancar, moverse, plata, ciudad, vivir, facu
  nombre text not null,
  descripcion text not null,
  icono text not null default 'lugar',
  orden int not null default 0,
  es_lista boolean not null default false  -- true: se puede tildar cada ítem
);
create table public.guia_items (
  id bigint generated always as identity primary key,
  grupo_id uuid references public.grupos(id) on delete cascade,  -- null: para todos
  seccion text not null references public.secciones_guia(slug),
  titulo text not null,
  bajada text,
  cuerpo text,
  pasos jsonb not null default '[]',
  dato text,
  etiquetas text[] not null default '{}',
  barrio text,
  direccion text,
  lat double precision,
  lon double precision,
  enlace text,
  fuente_url text,
  fuente_nombre text,
  vigente_a text,
  vence date,
  confianza text not null default 'alta' check (confianza in ('alta','media')),
  orden int not null default 0,
  publicado boolean not null default true,
  busqueda tsvector generated always as (
    setweight(to_tsvector('spanish', coalesce(titulo,'')),'A') ||
    setweight(to_tsvector('spanish', coalesce(bajada,'')),'B') ||
    setweight(to_tsvector('spanish', coalesce(cuerpo,'')),'C')
  ) stored,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);
create index guia_seccion_idx on public.guia_items(seccion, orden);
create index guia_busqueda_idx on public.guia_items using gin(busqueda);

create table public.guardados (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  item_id bigint not null references public.guia_items(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (perfil_id, item_id)
);
create table public.progreso_items (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  item_id bigint not null references public.guia_items(id) on delete cascade,
  hecho_en timestamptz not null default now(),
  primary key (perfil_id, item_id)
);
create table public.test_preguntas (
  id int primary key,
  texto text not null,
  area text not null
);

-- ───── Mapa ─────
create table public.lugares (
  id bigint generated always as identity primary key,
  grupo_id uuid references public.grupos(id) on delete cascade,  -- null: para todos
  tipo text not null check (tipo in ('facu','salida','transporte')),
  nombre text not null,
  descripcion text,
  lat double precision not null,
  lon double precision not null,
  destacado boolean not null default false,
  orden int not null default 0
);
create table public.aportes (
  id bigint generated always as identity primary key,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  autor_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('atajo','lugar','aviso','salida','pedido')),
  titulo text not null,
  nota text,
  lat double precision,
  lon double precision,
  creado_en timestamptz not null default now(),
  expira_en timestamptz
);
create index aportes_grupo_idx on public.aportes(grupo_id, creado_en desc);
create table public.favoritos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null,
  lat double precision not null,
  lon double precision not null,
  frecuente boolean not null default false,
  usado_en timestamptz not null default now(),
  unique (perfil_id, lat, lon)
);

-- ───── Mensajes ─────
create table public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  tipo text not null check (tipo in ('directa','grupo')),
  titulo text,
  clave_directa text unique,
  ultimo_en timestamptz not null default now(),
  ultimo_texto text,
  creado_en timestamptz not null default now()
);
create table public.conversacion_miembros (
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  ultimo_leido_en timestamptz not null default now(),
  silenciada boolean not null default false,
  primary key (conversacion_id, perfil_id)
);
create index miembros_perfil_idx on public.conversacion_miembros(perfil_id);
create table public.mensajes (
  id bigint generated always as identity primary key,
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  autor_id uuid not null references public.perfiles(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 4000),
  adjunto jsonb,
  creado_en timestamptz not null default now()
);
create index mensajes_conv_idx on public.mensajes(conversacion_id, creado_en desc);
create table public.bloqueos (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  bloqueado_id uuid not null references public.perfiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (perfil_id, bloqueado_id)
);

-- ───── Juntadas y cuentas ─────
create table public.juntadas (
  id bigint generated always as identity primary key,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  creada_por uuid not null references public.perfiles(id) on delete cascade,
  titulo text not null,
  lugar_nombre text,
  lat double precision,
  lon double precision,
  cuando timestamptz not null,
  nota text,
  creado_en timestamptz not null default now()
);
create table public.juntada_respuestas (
  juntada_id bigint not null references public.juntadas(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  estado text not null check (estado in ('voy','quizas','no')),
  primary key (juntada_id, perfil_id)
);
create table public.cuentas (
  id bigint generated always as identity primary key,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  creada_por uuid not null references public.perfiles(id) on delete cascade,
  titulo text not null,
  miembros uuid[] not null,
  cerrada boolean not null default false,
  creado_en timestamptz not null default now()
);
create table public.cuenta_gastos (
  id bigint generated always as identity primary key,
  cuenta_id bigint not null references public.cuentas(id) on delete cascade,
  pago_id uuid not null references public.perfiles(id),
  concepto text not null,
  monto numeric(12,2) not null check (monto > 0),
  creado_en timestamptz not null default now()
);

-- ───── Facu y organización personal ─────
create table public.materias (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null,
  color text not null default '#0B4F9E',
  profesor text,
  estado text not null default 'cursando' check (estado in ('cursando','regular','aprobada','pendiente')),
  nota numeric(4,2),
  creado_en timestamptz not null default now()
);
create table public.clases (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  materia_id bigint not null references public.materias(id) on delete cascade,
  dia int not null check (dia between 0 and 6),
  hora_inicio time not null,
  hora_fin time not null,
  aula text,
  lugar_id bigint references public.lugares(id) on delete set null
);
create table public.eventos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  materia_id bigint references public.materias(id) on delete set null,
  tipo text not null check (tipo in ('parcial','final','tp','vencimiento','otro')),
  titulo text not null,
  fecha timestamptz not null,
  hecho boolean not null default false
);
create index eventos_perfil_idx on public.eventos(perfil_id, fecha);
create table public.apuntes (
  id bigint generated always as identity primary key,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  autor_id uuid not null references public.perfiles(id) on delete cascade,
  materia text not null,
  titulo text not null,
  enlace text not null check (enlace ~* '^https?://'),
  creado_en timestamptz not null default now()
);
create table public.gastos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  categoria text not null,
  monto numeric(12,2) not null check (monto > 0),
  fecha date not null default current_date,
  nota text
);
create index gastos_perfil_idx on public.gastos(perfil_id, fecha desc);

-- ───── Notificaciones ─────
create table public.notificaciones (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  enlace text,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);
create index notif_perfil_idx on public.notificaciones(perfil_id, creado_en desc);
create table public.suscripciones_push (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  agente text,
  creado_en timestamptz not null default now()
);
create table public.config_interna (
  clave text primary key,
  valor text not null
);

create table public.bloques_guia (
  slug text primary key,
  nombre text not null,
  descripcion text not null,
  icono text not null,
  orden int not null default 0
);
