-- Partner portal records: sponsor submissions and prospect pipeline entries
-- created by trained partners from /partner-portal. Server-side writes only;
-- admin reads and updates also go through the Next API using the service role.

create table if not exists public.partner_portal_records (
  id                      uuid primary key default gen_random_uuid(),
  record_type             text not null
                          check (record_type in ('sponsor_submission', 'prospect')),
  status                  text not null default 'new'
                          check (status in (
                            'new', 'contacted', 'interested', 'packet_sent',
                            'submitted', 'reviewing', 'approved', 'won',
                            'lost', 'passed'
                          )),

  partner_name            text,
  partner_email           text,
  partner_state           text,

  business_name           text not null,
  display_name            text,
  contact_name            text,
  contact_email           text,
  phone                   text,
  website                 text,

  requested_tier          text,
  quoted_price            text,
  state_placement         text,
  law_firm_status         text,

  logo_status             text,
  logo_file_name          text,
  logo_file_size          integer,
  logo_content_type       text,
  logo_link_notes         text,

  ad_wording              text,
  public_contact_line     text,
  business_description    text,
  conversation_notes      text,

  prospect_stage          text,
  interest_level          text,
  best_signal             text,
  next_follow_up          date,

  monthly_amount          numeric(10, 2),
  commission_rate         numeric(5, 2) default 25,
  sponsor_payment_status  text,
  commission_status       text,
  square_customer_url     text,
  square_contract_url     text,
  square_subscription_url text,
  admin_notes             text,

  payload                 jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists partner_portal_records_type_status_idx
  on public.partner_portal_records (record_type, status, created_at desc);
create index if not exists partner_portal_records_partner_email_idx
  on public.partner_portal_records (partner_email);
create index if not exists partner_portal_records_created_idx
  on public.partner_portal_records (created_at desc);

alter table public.partner_portal_records enable row level security;
-- No public policies: all reads/writes use server-side service-role access.
