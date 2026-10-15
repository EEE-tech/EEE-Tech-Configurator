-- EEE Tech Configurator: storage for the catalog and datasheets, and a table for visitor requests.
insert into storage.buckets (id, name, public)
values ('configurator', 'configurator', true)
on conflict (id) do update set public = true;

create table if not exists public.configurator_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  company     text,
  quantity    text,
  reference   text,
  series      text,
  criteria    text,
  message     text not null,
  page        text,
  status      text not null default 'new'
);

-- Only the edge function (service role) writes; nobody can read requests from the browser.
alter table public.configurator_requests enable row level security;
