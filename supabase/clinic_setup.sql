-- Run this once in the Supabase SQL Editor before adding the app keys.
-- Patient records are kept in one clinic-scoped document. Only staff rows
-- added by the project owner can read or update it.

create table if not exists public.clinic_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'secretary', 'doctor')),
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_state (
  id integer primary key check (id = 1),
  data jsonb not null,
  version bigint not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.clinic_state (id, data, version)
values (
  1,
  jsonb_build_object(
    'version', 1,
    'patients', jsonb_build_array(),
    'queue', jsonb_build_array(),
    'nextQueueNumber', 1
  ),
  0
)
on conflict (id) do nothing;

alter table public.clinic_staff enable row level security;
alter table public.clinic_state enable row level security;

revoke all on table public.clinic_staff from anon, authenticated;
revoke all on table public.clinic_state from anon, authenticated;
grant select on table public.clinic_staff to authenticated;
grant select, update on table public.clinic_state to authenticated;

drop policy if exists clinic_staff_read_self on public.clinic_staff;
create policy clinic_staff_read_self
  on public.clinic_staff
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists clinic_state_read_staff on public.clinic_state;
create policy clinic_state_read_staff
  on public.clinic_state
  for select
  to authenticated
  using (
    id = 1
    and exists (
      select 1
      from public.clinic_staff as staff
      where staff.user_id = (select auth.uid())
    )
  );

drop policy if exists clinic_state_update_staff on public.clinic_state;
create policy clinic_state_update_staff
  on public.clinic_state
  for update
  to authenticated
  using (
    id = 1
    and exists (
      select 1
      from public.clinic_staff as staff
      where staff.user_id = (select auth.uid())
    )
  )
  with check (
    id = 1
    and exists (
      select 1
      from public.clinic_staff as staff
      where staff.user_id = (select auth.uid())
    )
  );

create or replace function public.validate_clinic_state_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $$
declare
  visit jsonb;
  prior_visit jsonb;
  latest_exam jsonb;
  exam_date date;
  visit_date date;
  consultations_in_month bigint;
  is_initial_data_migration boolean;
begin
  if new.version <> old.version + 1 then
    raise exception 'Clinic data changed on another device. Reload and retry.'
      using errcode = '40001';
  end if;

  if new.data->>'version' is distinct from '1'
    or jsonb_typeof(new.data->'patients') is distinct from 'array'
    or jsonb_typeof(new.data->'queue') is distinct from 'array'
    or (new.data->>'nextQueueNumber') is null then
    raise exception 'Invalid clinic data document.' using errcode = '22023';
  end if;

  is_initial_data_migration := old.version = 0
    and jsonb_array_length(old.data->'queue') = 0
    and jsonb_array_length(new.data->'queue') > 1;

  for visit in select value from jsonb_array_elements(new.data->'queue')
  loop
    if coalesce(visit->>'type', '') not in ('exam', 'consultation')
      or coalesce(visit->>'status', '') not in ('waiting', 'in_doctor', 'done')
      or coalesce(visit->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid visit record.' using errcode = '22023';
    end if;

    if visit->>'type' = 'consultation' then
      select candidate.item
      into latest_exam
      from jsonb_array_elements(new.data->'queue') as candidate(item)
      where candidate.item->>'patientId' = visit->>'patientId'
        and candidate.item->>'type' = 'exam'
        and candidate.item->>'status' = 'done'
        and candidate.item->>'date' <= visit->>'date'
      order by candidate.item->>'date' desc
      limit 1;

      if latest_exam is null then
        raise exception 'A consultation requires a completed earlier examination.'
          using errcode = '23514';
      end if;

      select previous.item
      into prior_visit
      from jsonb_array_elements(old.data->'queue') as previous(item)
      where previous.item->>'id' = visit->>'id'
      limit 1;

      if not is_initial_data_migration
        and (
          prior_visit is null
          or prior_visit->>'type' is distinct from 'consultation'
          or prior_visit->>'patientId' is distinct from visit->>'patientId'
          or prior_visit->>'date' is distinct from visit->>'date'
        ) then
        exam_date := (latest_exam->>'date')::date;
        visit_date := (visit->>'date')::date;

        if visit_date > (exam_date + interval '1 month')::date then
          raise exception 'A new examination is required after one month.'
            using errcode = '23514';
        end if;

        select count(*)
        into consultations_in_month
        from jsonb_array_elements(new.data->'queue') as scheduled(item)
        where scheduled.item->>'patientId' = visit->>'patientId'
          and scheduled.item->>'type' = 'consultation'
          and left(scheduled.item->>'date', 7) = left(visit->>'date', 7)
          and scheduled.item->>'id' <> visit->>'id';

        if consultations_in_month >= 2 then
          raise exception 'A patient may have at most two consultations per month.'
            using errcode = '23514';
        end if;
      end if;
    end if;
  end loop;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_clinic_state_update on public.clinic_state;
create trigger validate_clinic_state_update
  before update on public.clinic_state
  for each row execute function public.validate_clinic_state_update();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'clinic_state'
    ) then
    execute 'alter publication supabase_realtime add table public.clinic_state';
  end if;
end;
$$;
