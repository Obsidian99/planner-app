-- Run this once in the Supabase SQL editor if you already have a live "items" table
-- from the original schema. Safe to run on an existing table with data.

alter table public.items add column if not exists parent_id uuid references public.items(id) on delete cascade;
alter table public.items add column if not exists tags text[] not null default '{}';

create index if not exists items_parent_id_idx on public.items (parent_id);
create index if not exists items_tags_idx on public.items using gin (tags);
create index if not exists items_user_id_idx on public.items (user_id);
