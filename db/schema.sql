create extension if not exists pgcrypto;

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_no text not null unique,
  name text not null,
  role text not null default 'employee' check (role in ('employee', 'admin')),
  pin_hash text not null,
  pin_salt text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists employee_devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  device_id text not null,
  user_agent_hash text not null,
  status text not null check (
    status in ('approved', 'pending_replacement', 'replaced', 'revoked')
  ),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references employees(id) on delete set null,
  first_ip text,
  last_ip text,
  last_seen_at timestamptz,
  replacement_of uuid references employee_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_device_once unique (employee_id, device_id)
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  device_record_id uuid references employee_devices(id) on delete set null,
  token_hash text not null unique,
  device_id text not null,
  user_agent_hash text not null,
  first_ip text,
  last_ip text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_ip text,
  check_out_ip text,
  check_in_session_id uuid references sessions(id) on delete set null,
  check_out_session_id uuid references sessions(id) on delete set null,
  work_type text not null default 'office' check (
    work_type in ('office', 'remote', 'offsite', 'business_trip')
  ),
  note text,
  source text not null default 'employee' check (source in ('employee', 'admin')),
  created_by uuid references employees(id) on delete set null,
  updated_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_one_row_per_employee_date unique (employee_id, work_date),
  constraint attendance_checkout_after_checkin check (
    check_in_at is null
    or check_out_at is null
    or check_out_at >= check_in_at
  )
);

create table if not exists attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references attendance_records(id) on delete cascade,
  action text not null check (action in ('create', 'update')),
  changed_by uuid references employees(id) on delete set null,
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb,
  reason text
);

create index if not exists sessions_employee_idx on sessions(employee_id);
create index if not exists sessions_device_idx on sessions(device_id);
create index if not exists sessions_active_idx
  on sessions(token_hash, expires_at)
  where revoked_at is null;

create unique index if not exists employee_devices_one_approved_idx
  on employee_devices(employee_id)
  where status = 'approved';

create index if not exists employee_devices_status_idx
  on employee_devices(status, requested_at desc);

create index if not exists attendance_employee_date_idx
  on attendance_records(employee_id, work_date desc);

create index if not exists attendance_work_date_idx
  on attendance_records(work_date desc);

create index if not exists attendance_audit_record_idx
  on attendance_audit_logs(attendance_record_id, changed_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists employees_set_updated_at on employees;
create trigger employees_set_updated_at
before update on employees
for each row execute function set_updated_at();

drop trigger if exists employee_devices_set_updated_at on employee_devices;
create trigger employee_devices_set_updated_at
before update on employee_devices
for each row execute function set_updated_at();

drop trigger if exists attendance_records_set_updated_at on attendance_records;
create trigger attendance_records_set_updated_at
before update on attendance_records
for each row execute function set_updated_at();
