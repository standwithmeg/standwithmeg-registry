-- Referral rewards system for Connection Circles.
-- A member shares an invite link. When a new person clicks it, logs in, and
-- pays for their own access, the original inviter earns one free month.

-- Track every invite-link conversion.
create table if not exists public.connection_circle_referrals (
  id              uuid primary key default gen_random_uuid(),
  inviter_email   text not null,
  referred_email  text,
  invite_link_token text not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'completed', 'rewarded')),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  rewarded_at     timestamptz
);

create index if not exists idx_connection_circle_referrals_inviter
  on public.connection_circle_referrals (lower(inviter_email), status, created_at desc);

create index if not exists idx_connection_circle_referrals_referred
  on public.connection_circle_referrals (lower(referred_email), status);

create index if not exists idx_connection_circle_referrals_token
  on public.connection_circle_referrals (invite_link_token);

-- Record every free-month reward given to a referrer.
create table if not exists public.connection_circle_referrer_rewards (
  id              uuid primary key default gen_random_uuid(),
  referral_id     uuid references public.connection_circle_referrals(id) on delete set null,
  referrer_email  text not null,
  reward_months   int not null default 1 check (reward_months > 0),
  status          text not null default 'active'
                    check (status in ('active', 'applied', 'expired')),
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_connection_circle_referrer_rewards_referrer
  on public.connection_circle_referrer_rewards (lower(referrer_email), status);

-- Link access grants back to the referrer so we know who invited whom.
alter table public.connection_circle_access
  add column if not exists referrer_email text,
  add column if not exists referral_status text check (referral_status in ('pending', 'completed', 'rewarded'));

create index if not exists idx_connection_circle_access_referrer
  on public.connection_circle_access (lower(referrer_email), referral_status);

-- Track total free months earned per member (user record).
alter table public.connection_circle_pseudonyms
  add column if not exists reward_months_earned int not null default 0 check (reward_months_earned >= 0);

-- Make invite links usable by unlimited people (null = unlimited).
alter table public.connection_circle_invite_links
  alter column remaining_uses drop not null;

alter table public.connection_circle_referrals enable row level security;
alter table public.connection_circle_referrer_rewards enable row level security;
-- No public policies: reads/writes go through the Next.js API using service_role.
