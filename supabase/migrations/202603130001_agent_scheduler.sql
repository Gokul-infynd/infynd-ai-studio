create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create or replace function public.infynd_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  workspace_id uuid,
  created_by uuid,
  name text not null,
  prompt text not null,
  frequency text not null,
  timezone text not null default 'Asia/Kolkata',
  cron_expression text not null,
  schedule_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  cron_job_id bigint,
  cron_job_name text,
  trigger_token text not null,
  last_run_at timestamptz,
  last_status text,
  last_response jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.agent_schedules add column if not exists workspace_id uuid;
alter table public.agent_schedules add column if not exists created_by uuid;
alter table public.agent_schedules add column if not exists name text;
alter table public.agent_schedules add column if not exists prompt text;
alter table public.agent_schedules add column if not exists frequency text;
alter table public.agent_schedules add column if not exists timezone text default 'Asia/Kolkata';
alter table public.agent_schedules add column if not exists cron_expression text;
alter table public.agent_schedules add column if not exists schedule_config jsonb default '{}'::jsonb;
alter table public.agent_schedules add column if not exists is_active boolean default true;
alter table public.agent_schedules add column if not exists cron_job_id bigint;
alter table public.agent_schedules add column if not exists cron_job_name text;
alter table public.agent_schedules add column if not exists trigger_token text;
alter table public.agent_schedules add column if not exists last_run_at timestamptz;
alter table public.agent_schedules add column if not exists last_status text;
alter table public.agent_schedules add column if not exists last_response jsonb;
alter table public.agent_schedules add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.agent_schedules add column if not exists updated_at timestamptz default timezone('utc', now());

create index if not exists agent_schedules_agent_idx on public.agent_schedules (agent_id);
create index if not exists agent_schedules_created_by_idx on public.agent_schedules (created_by);
create index if not exists agent_schedules_workspace_idx on public.agent_schedules (workspace_id);
create unique index if not exists agent_schedules_job_name_idx on public.agent_schedules (cron_job_name) where cron_job_name is not null;

drop trigger if exists trg_agent_schedules_updated_at on public.agent_schedules;
create trigger trg_agent_schedules_updated_at
before update on public.agent_schedules
for each row
execute function public.infynd_set_updated_at();

create table if not exists public.agent_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.agent_schedules(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  workspace_id uuid,
  created_by uuid,
  status text not null,
  request_payload jsonb default '{}'::jsonb,
  response_payload jsonb,
  error_message text,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.agent_schedule_runs add column if not exists workspace_id uuid;
alter table public.agent_schedule_runs add column if not exists created_by uuid;
alter table public.agent_schedule_runs add column if not exists status text;
alter table public.agent_schedule_runs add column if not exists request_payload jsonb default '{}'::jsonb;
alter table public.agent_schedule_runs add column if not exists response_payload jsonb;
alter table public.agent_schedule_runs add column if not exists error_message text;
alter table public.agent_schedule_runs add column if not exists started_at timestamptz default timezone('utc', now());
alter table public.agent_schedule_runs add column if not exists completed_at timestamptz;
alter table public.agent_schedule_runs add column if not exists duration_ms integer;
alter table public.agent_schedule_runs add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.agent_schedule_runs add column if not exists updated_at timestamptz default timezone('utc', now());

create index if not exists agent_schedule_runs_schedule_idx on public.agent_schedule_runs (schedule_id, started_at desc);
create index if not exists agent_schedule_runs_created_by_idx on public.agent_schedule_runs (created_by, started_at desc);
create index if not exists agent_schedule_runs_agent_idx on public.agent_schedule_runs (agent_id, started_at desc);

drop trigger if exists trg_agent_schedule_runs_updated_at on public.agent_schedule_runs;
create trigger trg_agent_schedule_runs_updated_at
before update on public.agent_schedule_runs
for each row
execute function public.infynd_set_updated_at();

create or replace function public.infynd_schedule_agent_job(
  p_job_name text,
  p_cron_expression text,
  p_webhook_url text,
  p_schedule_id uuid,
  p_trigger_token text
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_headers jsonb;
  v_body jsonb;
  v_command text;
  v_job_id bigint;
begin
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Infynd-Schedule-Token', p_trigger_token
  );

  v_body := jsonb_build_object(
    'schedule_id', p_schedule_id,
    'source', 'supabase-cron'
  );

  v_command := format(
    $$select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb);$$,
    p_webhook_url,
    v_headers::text,
    v_body::text
  );

  select cron.schedule(p_job_name, p_cron_expression, v_command) into v_job_id;
  return v_job_id;
end;
$$;

create or replace function public.infynd_unschedule_agent_job(
  p_job_name text default null,
  p_job_id bigint default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_job_id is not null then
    perform cron.unschedule(p_job_id);
    return true;
  end if;

  if p_job_name is not null and length(trim(p_job_name)) > 0 then
    perform cron.unschedule(p_job_name);
    return true;
  end if;

  return false;
exception
  when others then
    return false;
end;
$$;

grant execute on function public.infynd_schedule_agent_job(text, text, text, uuid, text) to service_role;
grant execute on function public.infynd_unschedule_agent_job(text, bigint) to service_role;
