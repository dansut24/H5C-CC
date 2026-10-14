-- Run once in the Neon SQL editor.
create extension if not exists pgcrypto;

create table releases (
  version text primary key,
  released_at timestamptz not null default now(),
  notes text
);
insert into releases (version, notes) values ('1.0.0', 'Initial release');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  region text not null default 'uk',
  update_model text check (update_model in ('managed','custom')),
  products text[] not null,
  maintenance_day int,
  maintenance_hour int,
  admin_email text not null,
  admin_name text not null,
  status text not null default 'provisioning',
  created_at timestamptz not null default now()
);

create table signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  company text not null,
  products text[] not null,
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table environments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('prod','uat','test','rmm')),
  version text not null references releases(version),
  schema_name text not null,
  status text not null default 'provisioning',
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind)
);

-- Shared tenant directory: one copy, visible to every environment.
create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  name text not null,
  unique (tenant_id, email)
);

create table env_access (
  user_id uuid not null references users(id) on delete cascade,
  environment_id uuid not null references environments(id) on delete cascade,
  role text not null default 'agent',
  primary key (user_id, environment_id)
);

create table provisioning_jobs (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  state text not null default 'pending',
  steps jsonb not null default '{}',
  attempts int not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
