-- Leads table for 43 Industries invest form
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text,
  message text,
  created_at timestamptz default now()
);

alter table public.leads enable row level security;

drop policy if exists "Service role only" on public.leads;
create policy "Service role only"
  on public.leads
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists leads_created_at_idx on public.leads (created_at desc);
