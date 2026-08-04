create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('task', 'event', 'note')),
  title text not null,
  body text not null default '',
  date date,
  time time,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.items enable row level security;
create policy "Users manage only their own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
