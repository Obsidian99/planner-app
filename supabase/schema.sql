create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('task', 'event', 'note')),
  parent_id uuid references public.items(id) on delete cascade,
  title text not null,
  body text not null default '',
  date date,       -- scheduled date for events/notes, due date for tasks
  time time,
  tags text[] not null default '{}',
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index items_parent_id_idx on public.items (parent_id);
create index items_tags_idx on public.items using gin (tags);
create index items_user_id_idx on public.items (user_id);

alter table public.items enable row level security;
create policy "Users manage only their own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
