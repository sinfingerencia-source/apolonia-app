-- Apolonia · pedidos mayoristas de la fábrica de pastas (11/11/2026).
-- Dos tipos de cliente: restaurantes (compran porciones congeladas) y mayoristas (compran cajas congeladas).
-- Proyecto propio de Apolonia, separado de cualquier otro negocio.
-- Cada cliente se crea la cuenta en la app; queda "pendiente" hasta que el dueño la aprueba y le confirma el tipo.
-- Cada cliente ve solo el catálogo de su tipo. Los pedidos se crean únicamente con apo_crear_pedido,
-- que toma los precios vigentes de la base (el cliente no puede mandar precios).
-- Al confirmar, el cliente descarga el remito (comprobante interno, no fiscal) en PDF.

-- ─────────────────────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────────────────────
create table apo_config (
  id int primary key default 1 check (id = 1),
  razon_social text not null default 'Apolonia · La Fábrica',
  cuit text not null default '',
  direccion text not null default '',
  telefono text not null default '',
  email text not null default '',
  leyenda_remito text not null default 'Producto 100% calidad. Comprobante interno, no válido como factura.',
  actualizado_en timestamptz not null default now()
);
insert into apo_config default values;

create table apo_clientes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),       -- para la auditoría
  razon_social text not null check (length(trim(razon_social)) between 2 and 100),
  contacto text not null default '',
  cuit text not null default '',
  direccion text not null default '',
  telefono text not null default '',
  email text not null,
  tipo text not null check (tipo in ('restaurante', 'mayorista')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activo', 'bloqueado')),
  notas_admin text not null default '',
  creado_en timestamptz not null default now()
);

create table apo_productos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo text not null check (tipo in ('restaurante', 'mayorista')),
  nombre text not null,
  presentacion text not null default '',      -- "500 gramos", "12 unidades", "porción"
  unidad text not null default 'unidad',       -- cómo se cuenta: caja, porción, unidad
  variantes text[] not null default '{}',      -- sabores / colores a elegir; vacío = sin variantes
  precio numeric(14,2) not null check (precio >= 0),
  orden int not null default 0,
  activo boolean not null default true,
  actualizado_en timestamptz not null default now()
);

create sequence apo_pedidos_numero_seq start 1;

create table apo_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique default nextval('apo_pedidos_numero_seq'),
  cliente_id uuid not null references apo_clientes(user_id),
  tipo text not null check (tipo in ('restaurante', 'mayorista')),
  -- copia de los datos del cliente al momento del pedido (el remito no cambia si después edita su perfil)
  cliente_razon_social text not null,
  cliente_cuit text not null default '',
  cliente_direccion text not null default '',
  cliente_telefono text not null default '',
  estado text not null default 'recibido'
    check (estado in ('recibido', 'en_preparacion', 'enviado', 'entregado', 'cancelado')),
  entrega_deseada date,
  nota text not null default '' check (length(nota) <= 500),
  total numeric(14,2) not null default 0,
  remito_oficial text not null default '',     -- número del remito fiscal, si se emite aparte
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on apo_pedidos (cliente_id, creado_en desc);
create index on apo_pedidos (estado, creado_en desc);

create table apo_pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references apo_pedidos(id) on delete cascade,
  producto_id uuid references apo_productos(id),
  codigo text not null,
  nombre text not null,
  presentacion text not null default '',
  unidad text not null default 'unidad',
  variante text not null default '',
  cantidad int not null check (cantidad between 1 and 10000),
  precio numeric(14,2) not null,
  subtotal numeric(14,2) not null
);
create index on apo_pedido_items (pedido_id);

-- ─────────────────────────────────────────────────────────────
-- Quién es quién
-- ─────────────────────────────────────────────────────────────
-- Quién administra Apolonia (el dueño y quien él designe).
create table apo_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table apo_admins enable row level security;
revoke all on apo_admins from anon, authenticated;

create or replace function public.apo_es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from apo_admins where user_id = auth.uid());
$$;

-- Para dar permisos de administrador (se corre desde el panel de Supabase):  select apo_hacer_admin('mail@ejemplo.com');
create or replace function public.apo_hacer_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'No hay ninguna cuenta con ese email. Primero tiene que registrarse en la app.'; end if;
  insert into apo_admins (user_id) values (u) on conflict do nothing;
  delete from apo_clientes where user_id = u and not exists (select 1 from apo_pedidos where cliente_id = u);
end $$;
revoke execute on function public.apo_hacer_admin(text) from public, anon, authenticated;

-- Tipo del cliente que está usando la app, solo si está activo.
create or replace function public.apo_mi_tipo() returns text
language sql stable security definer set search_path = public as $$
  select tipo from apo_clientes where user_id = auth.uid() and estado = 'activo';
$$;

revoke execute on function public.apo_es_admin() from public, anon;
revoke execute on function public.apo_mi_tipo() from public, anon;
grant execute on function public.apo_es_admin() to authenticated;
grant execute on function public.apo_mi_tipo() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────
alter table apo_config enable row level security;
alter table apo_clientes enable row level security;
alter table apo_productos enable row level security;
alter table apo_pedidos enable row level security;
alter table apo_pedido_items enable row level security;

create policy apo_config_ver on apo_config for select to authenticated
  using (public.apo_es_admin() or public.apo_mi_tipo() is not null);
create policy apo_config_editar on apo_config for update to authenticated
  using (public.apo_es_admin()) with check (public.apo_es_admin());

create policy apo_clientes_ver on apo_clientes for select to authenticated
  using (user_id = auth.uid() or public.apo_es_admin());
create policy apo_clientes_admin on apo_clientes for update to authenticated
  using (public.apo_es_admin()) with check (public.apo_es_admin());
-- El cliente puede corregir sus propios datos de contacto (no el tipo ni el estado).
create policy apo_clientes_mios on apo_clientes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on apo_clientes from authenticated;
grant update (razon_social, contacto, cuit, direccion, telefono) on apo_clientes to authenticated;
-- el admin cambia tipo, estado y notas por función (ver apo_admin_cliente)

create policy apo_productos_ver on apo_productos for select to authenticated
  using (public.apo_es_admin() or (activo and tipo = public.apo_mi_tipo()));
create policy apo_productos_admin on apo_productos for all to authenticated
  using (public.apo_es_admin()) with check (public.apo_es_admin());

create policy apo_pedidos_ver on apo_pedidos for select to authenticated
  using (cliente_id = auth.uid() or public.apo_es_admin());
create policy apo_pedidos_admin on apo_pedidos for update to authenticated
  using (public.apo_es_admin()) with check (public.apo_es_admin());
revoke insert, delete on apo_pedidos from authenticated, anon;

create policy apo_items_ver on apo_pedido_items for select to authenticated
  using (exists (select 1 from apo_pedidos p where p.id = pedido_id
                 and (p.cliente_id = auth.uid() or public.apo_es_admin())));
revoke insert, update, delete on apo_pedido_items from authenticated, anon;

revoke all on apo_config, apo_clientes, apo_productos, apo_pedidos, apo_pedido_items from anon;

-- ─────────────────────────────────────────────────────────────
-- Funciones
-- ─────────────────────────────────────────────────────────────
-- El cliente confirma el pedido. p_items: [{"producto_id": uuid, "variante": text, "cantidad": int}, ...]
create or replace function public.apo_crear_pedido(p_items jsonb, p_nota text default '', p_entrega date default null)
returns apo_pedidos
language plpgsql security definer set search_path = public as $$
declare
  c apo_clientes;
  p apo_pedidos;
  it jsonb;
  pr apo_productos;
  v text;
  q int;
  tot numeric(14,2) := 0;
begin
  select * into c from apo_clientes where user_id = auth.uid();
  if c.user_id is null then raise exception 'No encontramos tu cuenta de cliente.'; end if;
  if c.estado <> 'activo' then raise exception 'Tu cuenta todavía no está habilitada para hacer pedidos.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío.';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Demasiados renglones en el pedido.'; end if;
  if p_entrega is not null and p_entrega < (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'La fecha de entrega no puede ser anterior a hoy.';
  end if;

  insert into apo_pedidos (cliente_id, tipo, cliente_razon_social, cliente_cuit, cliente_direccion, cliente_telefono,
                           entrega_deseada, nota)
  values (c.user_id, c.tipo, c.razon_social, c.cuit, c.direccion, c.telefono, p_entrega, left(coalesce(trim(p_nota), ''), 500))
  returning * into p;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from apo_productos where id = (it->>'producto_id')::uuid;
    if pr.id is null or not pr.activo or pr.tipo <> c.tipo then
      raise exception 'Hay un producto que ya no está disponible. Actualizá la página y volvé a armar el pedido.';
    end if;
    q := (it->>'cantidad')::int;
    if q is null or q < 1 or q > 10000 then raise exception 'Cantidad inválida para %.', pr.nombre; end if;
    v := coalesce(trim(it->>'variante'), '');
    if cardinality(pr.variantes) > 0 and not (v = any(pr.variantes)) then
      raise exception 'Elegí una opción para %.', pr.nombre;
    end if;
    if cardinality(pr.variantes) = 0 then v := ''; end if;
    insert into apo_pedido_items (pedido_id, producto_id, codigo, nombre, presentacion, unidad, variante, cantidad, precio, subtotal)
    values (p.id, pr.id, pr.codigo, pr.nombre, pr.presentacion, pr.unidad, v, q, pr.precio, pr.precio * q);
    tot := tot + pr.precio * q;
  end loop;

  update apo_pedidos set total = tot where id = p.id returning * into p;
  return p;
end $$;

-- El admin habilita, bloquea o cambia el tipo de un cliente.
create or replace function public.apo_admin_cliente(p_user uuid, p_tipo text, p_estado text, p_notas text default null)
returns apo_clientes
language plpgsql security definer set search_path = public as $$
declare c apo_clientes;
begin
  if not public.apo_es_admin() then raise exception 'Sin permiso.'; end if;
  update apo_clientes set tipo = p_tipo, estado = p_estado, notas_admin = coalesce(p_notas, notas_admin)
  where user_id = p_user returning * into c;
  return c;
end $$;

-- El admin cambia el estado de un pedido o le anota el número de remito oficial.
create or replace function public.apo_admin_pedido(p_pedido uuid, p_estado text, p_remito_oficial text default null)
returns apo_pedidos
language plpgsql security definer set search_path = public as $$
declare p apo_pedidos;
begin
  if not public.apo_es_admin() then raise exception 'Sin permiso.'; end if;
  update apo_pedidos set estado = p_estado,
         remito_oficial = coalesce(trim(p_remito_oficial), remito_oficial),
         actualizado_en = now()
  where id = p_pedido returning * into p;
  return p;
end $$;

revoke execute on function public.apo_crear_pedido(jsonb, text, date) from public, anon;
revoke execute on function public.apo_admin_cliente(uuid, text, text, text) from public, anon;
revoke execute on function public.apo_admin_pedido(uuid, text, text) from public, anon;
grant execute on function public.apo_crear_pedido(jsonb, text, date) to authenticated;
grant execute on function public.apo_admin_cliente(uuid, text, text, text) to authenticated;
grant execute on function public.apo_admin_pedido(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Alta de cuenta: cada registro nuevo queda como cliente pendiente de aprobación.
-- ─────────────────────────────────────────────────────────────
create or replace function public.apo_al_registrarse() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  begin
    insert into apo_clientes (user_id, razon_social, contacto, cuit, direccion, telefono, email, tipo)
    values (new.id, trim(m->>'razon_social'), trim(coalesce(m->>'contacto', '')),
            trim(coalesce(m->>'cuit', '')), trim(coalesce(m->>'direccion', '')),
            regexp_replace(coalesce(m->>'telefono', ''), '[^0-9+ ]', '', 'g'), lower(new.email),
            case when m->>'tipo_cliente' = 'mayorista' then 'mayorista' else 'restaurante' end);
  exception when others then
    null;   -- si faltan datos, el cliente los completa al entrar (apo_registrarme)
  end;
  return new;
end $$;
revoke execute on function public.apo_al_registrarse() from public, anon, authenticated;
create trigger apo_al_registrarse after insert on auth.users for each row execute function public.apo_al_registrarse();

-- Si el alta automática falló (datos incompletos), el cliente la completa desde la app.
create or replace function public.apo_registrarme(p_razon_social text, p_contacto text, p_cuit text,
                                                  p_direccion text, p_telefono text, p_tipo text)
returns apo_clientes
language plpgsql security definer set search_path = public as $$
declare c apo_clientes; e text;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión primero.'; end if;
  select email into e from auth.users where id = auth.uid();
  insert into apo_clientes (user_id, razon_social, contacto, cuit, direccion, telefono, email, tipo)
  values (auth.uid(), trim(p_razon_social), trim(coalesce(p_contacto, '')), trim(coalesce(p_cuit, '')),
          trim(coalesce(p_direccion, '')), regexp_replace(coalesce(p_telefono, ''), '[^0-9+ ]', '', 'g'),
          lower(e), case when p_tipo = 'mayorista' then 'mayorista' else 'restaurante' end)
  on conflict (user_id) do nothing
  returning * into c;
  if c.user_id is null then select * into c from apo_clientes where user_id = auth.uid(); end if;
  return c;
end $$;
revoke execute on function public.apo_registrarme(text, text, text, text, text, text) from public, anon;
grant execute on function public.apo_registrarme(text, text, text, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Catálogo inicial (lista del 11/11/2026)
-- ─────────────────────────────────────────────────────────────
insert into apo_productos (codigo, tipo, nombre, presentacion, unidad, variantes, precio, orden) values
  -- Cajas congeladas para mayoristas (precio por caja)
  ('C-001', 'mayorista', 'Ñoquis',                    '500 gramos',                       'caja', '{}', 2000, 1),
  ('C-002', 'mayorista', 'Fetuccini',                 '500 gramos',                       'caja', '{}', 2500, 2),
  ('C-003', 'mayorista', 'Ravioles de ricota',        '1 plancha / 24 unidades grandes',  'caja', '{}', 2200, 3),
  ('C-004', 'mayorista', 'Sorrentinos jamón y queso', '12 unidades',                      'caja', '{}', 6000, 4),
  ('C-005', 'mayorista', 'Raviolones de calabaza',    '12 unidades',                      'caja', '{}', 4000, 5),
  ('C-006', 'mayorista', 'Fusiles al huevo',          '500 gramos',                       'caja', '{}', 2500, 6),
  -- Porciones congeladas para restaurantes (precio por porción)
  ('T-001', 'restaurante', 'Ñoquis',                         'Porción congelada', 'porción', '{}', 4000, 1),
  ('T-002', 'restaurante', 'Spaghettis',                     'Porción congelada', 'porción', '{}', 4000, 2),
  ('T-003', 'restaurante', 'Fetuccini',                      'Porción congelada', 'porción', '{Espinaca,Huevo}', 4000, 3),
  ('T-004', 'restaurante', 'Fusiles',                        'Porción congelada', 'porción', '{Verdes,Rosa}', 5000, 4),
  ('T-005', 'restaurante', 'Flor (pappardelle)',             'Porción congelada', 'porción', '{}', 4000, 5),
  ('T-006', 'restaurante', 'Churro (fideos rellenos)',       'Porción congelada', 'porción', '{}', 3500, 6),
  ('T-007', 'restaurante', 'Ravioles de salmón',             'Porción congelada', 'porción', '{}', 7500, 7),
  ('T-008', 'restaurante', 'Ravioles de calabaza',           'Porción congelada', 'porción', '{}', 6500, 8),
  ('T-009', 'restaurante', 'Ravioles de ricota y queso',     'Porción congelada', 'porción', '{}', 5000, 9),
  ('T-010', 'restaurante', 'Ravioles de ricota y espinaca',  'Porción congelada', 'porción', '{}', 5000, 10),
  ('T-011', 'restaurante', 'Ravioles de pollo y verdura',    'Porción congelada', 'porción', '{}', 5000, 11),
  ('T-012', 'restaurante', 'Ravioles de ricota y jamón',     'Porción congelada', 'porción', '{}', 5000, 12),
  ('T-013', 'restaurante', 'Sorrentinos',                    'Porción congelada', 'porción', '{}', 6000, 13),
  ('T-014', 'restaurante', 'Lasagna',                        'Porción congelada', 'porción', '{}', 6000, 14),
  ('T-015', 'restaurante', 'Canelones',                      'Porción congelada', 'porción', '{}', 6000, 15),
  ('T-016', 'restaurante', 'Empanadas',                      'Unidad congelada',  'unidad',  '{Carne,Jamón y queso}', 2500, 16);
