-- KraTte core tables. Run this FIRST, then 002_shop.sql.
-- Supabase → SQL Editor, or: psql "$DATABASE_URL" -f supabase/001_core.sql
--
-- profiles is the only table a browser client ever touches directly, and
-- only its own row (it's how Settings reads the current plan without a
-- round-trip through the API). Everything else is RLS-enabled with no
-- policies: the backend reaches it with the service role, which bypasses
-- RLS, and enforces ownership itself.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free',
  email text,
  whatsapp_number text unique,
  whatsapp_link_code text,
  whatsapp_link_code_expires timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- A profile row is created for every new sign-up, so the app never has to
-- special-case "signed in but no profile yet".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Every movement of money in the shop lands here: sales, purchases, and
-- expenses all write one row. Orders link back via order_id; the money
-- side of an order is always exactly one ledger entry.
create table if not exists public.ledger_entries (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id text,
  direction text not null default 'out',
  amount numeric(14, 2) not null,
  currency text not null default 'ZMW',
  party text,
  category text,
  occurred_on date not null,
  note text,
  source text not null default 'manual',
  status text not null default 'processed',
  confidence text,
  image_path text,
  raw jsonb,
  line_items jsonb,
  order_id text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ledger_entries enable row level security;
create index if not exists ix_ledger_user on public.ledger_entries (user_id);
create index if not exists ix_ledger_business on public.ledger_entries (business_id);
create index if not exists ix_ledger_occurred on public.ledger_entries (user_id, occurred_on desc);

create table if not exists public.categories (
  slug text primary key,
  name text not null,
  icon text
);
alter table public.categories enable row level security;

-- Manual MoMo billing: the owner pays off-app and submits a reference,
-- which the operator confirms from the admin API. No gateway, no webhook.
create table if not exists public.payment_requests (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_requested text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'ZMW',
  momo_network text not null,
  momo_reference text not null,
  momo_sender_number text,
  status text not null default 'pending',
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
alter table public.payment_requests enable row level security;
create index if not exists ix_payment_requests_user on public.payment_requests (user_id);
create index if not exists ix_payment_requests_status on public.payment_requests (status);

-- Meta retries a webhook delivery it doesn't get a fast 200 for. The
-- webhook claims the message_id here BEFORE doing any work, so a retry
-- that overlaps the first attempt dies at the insert instead of ringing
-- up the same sale twice.
create table if not exists public.whatsapp_processed_messages (
  message_id text primary key,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_processed_messages enable row level security;
