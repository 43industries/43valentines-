-- Run this in Supabase: SQL Editor → New query → paste → Run
-- Creates the leads table and enables RLS (only service role can read/write from Netlify)

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text,
  message text,
  created_at timestamptz default now()
);

alter table public.leads enable row level security;

-- Only the service role (used by Netlify) can insert/select; no anon access
drop policy if exists "Service role only" on public.leads;
create policy "Service role only"
  on public.leads
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Optional: index for sorting by date
create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- -------------------------------------------------------------------
-- Investor portal schema (for 43 Industries investor accounts)
-- -------------------------------------------------------------------

-- Each authenticated user gets one investor_profile row, keyed by auth.uid().
create table if not exists public.investor_profiles (
  id uuid primary key, -- should match auth.users.id
  full_name text,
  role text,
  created_at timestamptz not null default now()
);

-- Individual investment records per investor.
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investor_profiles(id) on delete cascade,
  amount numeric not null,
  currency text not null default 'USD',
  status text not null default 'pending', -- e.g. pending, committed, active, exited
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at in sync.
create or replace function public.set_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp_investments on public.investments;
create trigger set_timestamp_investments
before update on public.investments
for each row
execute procedure public.set_timestamp();

-- -------------------------------------------------------------------
-- Row Level Security (RLS) policies for portal
-- -------------------------------------------------------------------

alter table public.investor_profiles enable row level security;
alter table public.investments enable row level security;

-- Only the authenticated user can see and update their own profile.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'investor_profiles'
      and policyname = 'investor_profiles_self_access'
  ) then
    create policy investor_profiles_self_access
    on public.investor_profiles
    for all
    using (id = auth.uid())
    with check (id = auth.uid());
  end if;
end;
$$;

-- Each user can only see and modify their own investments.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'investments'
      and policyname = 'investments_by_investor'
  ) then
    create policy investments_by_investor
    on public.investments
    for all
    using (investor_id = auth.uid())
    with check (investor_id = auth.uid());
  end if;
end;
$$;

