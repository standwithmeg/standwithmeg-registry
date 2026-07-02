-- Connection Circle chat rooms: one pseudonymous group conversation per
-- court-actor circle. Members talk under handles; real identities are only
-- ever exchanged through the existing consent-based connection requests.
--
-- Same security model as 029/030: RLS enabled with NO policies = deny all to
-- anon/authenticated; every read/write goes through the service-role client
-- in lib/connection-circle-chat.ts, which enforces circle membership.

create table if not exists connection_circle_messages (
  id               uuid primary key default gen_random_uuid(),
  -- The circle's stable actor key (base64url of name|state|role from
  -- lib/connection-circle-matching.actorKey). One room per key.
  actor_key        text not null,
  -- Sender identity (never exposed to other members; display uses the
  -- sender's live pseudonym handle resolved at read time).
  sender_email     text not null,
  body             text not null check (char_length(body) between 1 and 2000),
  created_at       timestamptz not null default now(),
  -- Soft delete: sender (or admin) can remove a message; row is preserved
  -- for moderation/audit but never returned to members.
  deleted_at       timestamptz,
  deleted_by       text
);

create index if not exists idx_connection_circle_messages_room
  on connection_circle_messages (actor_key, created_at desc);

create index if not exists idx_connection_circle_messages_sender
  on connection_circle_messages (lower(sender_email), created_at desc);

alter table connection_circle_messages enable row level security;
-- Intentionally NO create policy statements: deny-all except service_role.
-- Do not add SELECT policies — member reads must flow through the API so
-- membership, pseudonym resolution, and redaction are always enforced.
