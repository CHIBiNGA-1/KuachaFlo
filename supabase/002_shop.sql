-- KraTte shop tables. Run AFTER 001_core.sql. Run once, in
-- Supabase → SQL Editor (or via the psql one-liner in the README).
--
-- Every table here has RLS ENABLED with NO policies: the app talks to
-- these rows only through the backend, which uses the service role and
-- bypasses RLS. No browser client — anon or signed-in — can read or
-- write shop rows directly, ever. Ownership is enforced in the API:
-- every request resolves to exactly one business_id and is scoped to it.

create table if not exists public.businesses (
  id text primary key,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Shop',
  currency text not null default 'ZMW',
  created_at timestamptz not null default now()
);
alter table public.businesses enable row level security;

create table if not exists public.products (
  id text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  sku text not null,
  sku_normalized text not null,
  name text not null,
  category text not null default 'Other',
  price numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  stock integer not null default 0,
  reorder_at integer not null default 0,
  unit text,
  supplier_id text,
  image text,
  notes text,
  pinned boolean not null default false,
  archived boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
create index if not exists ix_products_business on public.products (business_id);
create index if not exists ix_products_sku on public.products (business_id, sku_normalized);

create table if not exists public.orders (
  id text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  kind text not null,
  reference text not null,
  party_name text not null default '',
  party_id text,
  status text not null,
  channel text not null default 'Retail',
  payment text not null default 'Paid',
  occurred_on date,
  due_on date,
  notes text,
  amount_total numeric(12, 2) not null default 0,
  ledger_entry_id text references public.ledger_entries (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_orders_business_kind_ref unique (business_id, kind, reference)
);
alter table public.orders enable row level security;
create index if not exists ix_orders_business_kind on public.orders (business_id, kind);

create table if not exists public.order_items (
  id text primary key,
  order_id text not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id),
  name_snapshot text not null,
  quantity integer not null,
  price_snapshot numeric(12, 2) not null,
  cost_snapshot numeric(12, 2) not null
);
alter table public.order_items enable row level security;
create index if not exists ix_order_items_order on public.order_items (order_id);
create index if not exists ix_order_items_product on public.order_items (product_id);

create table if not exists public.customers (
  id text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  channel text not null default 'Retail',
  balance_opening numeric(12, 2) not null default 0,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create index if not exists ix_customers_business on public.customers (business_id);

create table if not exists public.suppliers (
  id text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  name text not null,
  contact_person text,
  email text,
  phone text,
  category text,
  status text not null default 'Active',
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suppliers enable row level security;
create index if not exists ix_suppliers_business on public.suppliers (business_id);

create table if not exists public.team_members (
  id text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  name text not null,
  email text,
  role text not null default '',
  status text not null default 'Active',
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
create index if not exists ix_team_business on public.team_members (business_id);

create table if not exists public.order_sequences (
  business_id text not null references public.businesses (id) on delete cascade,
  kind text not null,
  value integer not null,
  primary key (business_id, kind)
);
alter table public.order_sequences enable row level security;

create table if not exists public.shop_idempotency_keys (
  business_id text not null references public.businesses (id) on delete cascade,
  key text not null,
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (business_id, key)
);
alter table public.shop_idempotency_keys enable row level security;

create table if not exists public.shop_audit_events (
  id text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  resource text not null,
  record_id text,
  request_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.shop_audit_events enable row level security;
create index if not exists ix_shop_audit_business on public.shop_audit_events (business_id);

-- Links a terminal order to its one money-side ledger entry.
alter table public.ledger_entries add column if not exists order_id text;

-- products.supplier_id is wired up here rather than inline, because
-- products is created before suppliers above.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_supplier_id_fkey'
  ) then
    alter table public.products
      add constraint products_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers (id) on delete set null;
  end if;
end $$;
