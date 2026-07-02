-- Sponsor inventory model (DEV-HANDOFF): a slot type per sponsor + a mission-fit
-- approval gate. Nothing renders publicly until approved = true.

alter table public.sponsors
  add column if not exists slot text
    check (slot in (
      'presenting', 'co_sponsor',
      'state_exclusive', 'community_supporter',
      'movement_partner', 'founding_reserve'
    )),
  add column if not exists approved boolean not null default false;

create index if not exists sponsors_slot_state_approved_idx
  on public.sponsors (slot, state, approved);

-- Seed the two demo sponsors as approved State Exclusives in their states.
update public.sponsors
set slot = 'state_exclusive', approved = true
where business_name in ('Uprise Remodeling', 'Gutter Girl');
