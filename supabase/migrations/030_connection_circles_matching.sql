-- Connection Circles matching: pseudonyms, double-opt-in connection requests,
-- and an audit log. Read/written only by the app via the service_role; RLS
-- stays on with no public policies so the anon key never sees identity data.
--
-- Privacy model:
--   * Pseudonyms are the only identity exposed to other parents in the match list.
--   * Requests never expose either parent's email until both sides accept.
--   * Recipient acts on a request via an unguessable token (no auth round-trip).

-------------------------------------------------------------------------------
-- Pseudonyms: handle + email map. One handle per email, case-insensitive
-- unique on handle so two parents can't claim the same one.
-------------------------------------------------------------------------------
create table if not exists connection_circle_pseudonyms (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  handle      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists uniq_connection_circle_pseudonyms_email
  on connection_circle_pseudonyms (lower(email));

create unique index if not exists uniq_connection_circle_pseudonyms_handle
  on connection_circle_pseudonyms (lower(handle));

-------------------------------------------------------------------------------
-- Connection requests: A asks to talk to B about a specific court actor.
-- B receives a private link (recipient_token) and accepts or declines.
-- Status lifecycle:
--   pending -> accepted | declined | withdrawn | expired
-- When accepted, the introduction email is sent and intro_sent_at is stamped.
-------------------------------------------------------------------------------
create table if not exists connection_circle_requests (
  id                          uuid primary key default gen_random_uuid(),
  requester_email             text not null,
  requester_handle            text not null,
  recipient_email             text not null,
  recipient_handle            text not null,

  -- Match context: which court actor brought these two parents together.
  -- name+state+role is the canonical signature already used elsewhere.
  actor_name                  text not null,
  actor_state                 char(2),
  actor_role                  text not null,

  -- Optional general note from the requester. Capped + scrubbed in the app.
  requester_message           text,

  status                      text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),

  -- Attestations: "I am the protective parent in this matter and I am not
  -- the named adversary." Stored as timestamps so we keep audit trail.
  requester_attestation_at    timestamptz not null default now(),
  recipient_attestation_at    timestamptz,

  -- Unguessable URL token so the recipient can act without re-authing.
  recipient_token             text not null unique,

  created_at                  timestamptz not null default now(),
  decided_at                  timestamptz,
  intro_sent_at               timestamptz,
  expires_at                  timestamptz not null default (now() + interval '30 days'),

  constraint connection_request_distinct_parties
    check (lower(requester_email) <> lower(recipient_email))
);

create index if not exists idx_connection_circle_requests_requester
  on connection_circle_requests (lower(requester_email), status);

create index if not exists idx_connection_circle_requests_recipient
  on connection_circle_requests (lower(recipient_email), status);

create index if not exists idx_connection_circle_requests_actor
  on connection_circle_requests (lower(actor_name), actor_state, actor_role);

-- One open request at a time per (requester, recipient, actor signature).
-- Lets a parent re-ask after a decline/expiry, but prevents flooding.
create unique index if not exists uniq_connection_circle_requests_open_pair
  on connection_circle_requests (
    lower(requester_email),
    lower(recipient_email),
    lower(actor_name),
    coalesce(actor_state, ''),
    actor_role
  )
  where status = 'pending';

-------------------------------------------------------------------------------
-- Audit log: every state change writes a row. Service-role only.
-------------------------------------------------------------------------------
create table if not exists connection_circle_audit (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid references connection_circle_requests(id) on delete set null,
  actor_email   text,
  event         text not null,
  detail        jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_connection_circle_audit_request
  on connection_circle_audit (request_id);

create index if not exists idx_connection_circle_audit_event_created
  on connection_circle_audit (event, created_at desc);

-------------------------------------------------------------------------------
-- RLS: enabled with no public policies. All access via service_role.
-------------------------------------------------------------------------------
alter table connection_circle_pseudonyms enable row level security;
alter table connection_circle_requests   enable row level security;
alter table connection_circle_audit      enable row level security;
