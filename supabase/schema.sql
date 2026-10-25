-- Threadline cloud database
-- Run in the Supabase SQL Editor for your Threadline project.

create table if not exists public.customers (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  phone text not null,
  height text,
  fit text,
  notes text,
  updated text,
  measurements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at_cloud timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.orders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  "customerId" text not null,
  customer text not null,
  garment text not null,
  due date not null,
  status text not null default 'Measurements taken',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  paid numeric(12,2) not null default 0 check (paid >= 0 and paid <= amount),
  notes text,
  created_at timestamptz not null default now(),
  updated_at_cloud timestamptz not null default now(),
  primary key (user_id, id),
  constraint orders_customer_same_owner
    foreign key (user_id, "customerId")
    references public.customers(user_id, id)
    on update cascade on delete restrict
);

create index if not exists customers_user_name_idx
  on public.customers (user_id, name);
create index if not exists customers_user_phone_idx
  on public.customers (user_id, phone);
create index if not exists orders_user_due_idx
  on public.orders (user_id, due);
create index if not exists orders_user_status_idx
  on public.orders (user_id, status);

alter table public.customers enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Owners manage their own customers" on public.customers;
create policy "Owners manage their own customers"
  on public.customers
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners manage their own orders" on public.orders;
create policy "Owners manage their own orders"
  on public.orders
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
