-- KuachaFlo Task 1: profiles + the irrevocable fork.
-- Run once in Supabase Dashboard → SQL Editor.
-- The "never get back" rule is enforced HERE, not just in the UI:
-- service_choice can be set exactly once, then RLS makes it immutable.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  service_choice text null check (service_choice in ('personal', 'shop')),
  chosen_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select, insert, update on public.profiles to authenticated;

-- Read your own row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- Create your own row (choiceless at first).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- Set your choice ONLY while it is still null.
-- Once set, no update can ever match this policy again → locked forever.
drop policy if exists "profiles_lock_once" on public.profiles;
create policy "profiles_lock_once" on public.profiles
  for update to authenticated
  using (auth.uid() = id and service_choice is null)
  with check (auth.uid() = id);
