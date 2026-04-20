-- ============================================================
-- Migration 005 — Dashboard Access Gate + State Resource Links
--
-- Creates:
--   1. dashboard_access_log — tracks visitors who complete the
--      public dashboard access gate (email, role, reason, terms)
--   2. state_resource_links — maps US state codes to Google Drive
--      folder URLs for state-specific Family Rights Reports
--
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================


-- ── 1. dashboard_access_log ───────────────────────────────────

create table if not exists dashboard_access_log (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),
  email       text        not null,
  state_of_interest text,               -- US state code or "all"
  role        text        not null,     -- impacted_parent, family_member, advocate, journalist, legislator, researcher, public
  reason      text,                     -- free-text reason for access
  agreed_terms boolean    not null default true,
  ip_hash     text                      -- SHA-256 of visitor IP
);

create index if not exists idx_access_log_email   on dashboard_access_log (email);
create index if not exists idx_access_log_created on dashboard_access_log (created_at desc);

-- RLS: no public policies — all access via service-role key
alter table dashboard_access_log enable row level security;


-- ── 2. state_resource_links ───────────────────────────────────

create table if not exists state_resource_links (
  id               uuid        primary key default gen_random_uuid(),
  state_code       char(2)     not null unique,
  state_name       text        not null,
  drive_folder_url text        not null,
  report_available boolean     not null default false,
  report_title     text,
  updated_at       timestamptz not null default now()
);

create index if not exists idx_state_resources_code on state_resource_links (state_code);

-- RLS: no public policies — all access via service-role key
alter table state_resource_links enable row level security;
