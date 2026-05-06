-- ============================================================
-- Migration 022 — Placeholder emails are unsafe for auto-dedupe
--
-- !!! HELD — DO NOT APPLY YET !!!
--
-- This migration is committed for review but is intentionally NOT
-- applied to production. Apply only after:
--   (a) migration 020 has been reviewed and applied (financial-
--       fingerprint dedup), and
--   (b) admin has manually reviewed the financial-fingerprint
--       candidate groups produced by scripts/reconciliation/
--       reconcile-counts.ts and made count_separately decisions
--       where appropriate.
--
-- Why this exists
-- ---------------
-- Multiple unrelated families submit using throwaway placeholder
-- addresses (anonymous@anonymous.com, none@none.com, test@test.com,
-- n/a@n/a.com, etc). Pass 1 of the dedupe in movement_stats_by_state
-- and movement_deduped_submissions uses (email_key, state) as a
-- collapse key, which silently merges all of them into one counted
-- family per state. The KS reconciliation found at least one such
-- collision: anonymous@anonymous.com pairing a Family Court / Unsure
-- county / Anonymous row with a CPS / Bourbon county / Z R row —
-- two clearly different families saved from being collapsed only
-- because an admin manually clicked count_separately on one row.
--
-- This migration patches both views to treat any placeholder email
-- as if it were null: each placeholder row gets a synthetic unique
-- key (`placeholder:<source_table>:<source_id>`) so it never
-- auto-collides with another placeholder row in pass 1. Real emails
-- are unaffected. Admin can still merge two placeholder rows by hand
-- via the existing review flow when they confirm one family.
--
-- Mirrors lib/placeholder-emails.ts and (eventually) the Python
-- helper used by the PDF generator. The set of placeholder local-
-- parts and domains here MUST match those modules exactly. Update
-- all three together when adding a new placeholder pattern.
-- ============================================================

create or replace function _is_placeholder_email(email text) returns boolean as $$
  -- Returns true when the lowercased email matches a known placeholder
  -- pattern. Mirrors isPlaceholderEmail in lib/placeholder-emails.ts.
  with
    norm as (
      select nullif(lower(trim(email)), '') as e
    ),
    parts as (
      select
        e,
        case when e ~ '^[^@]+@[^@]+$'
          then split_part(e, '@', 1)
          else null
        end as local_part,
        case when e ~ '^[^@]+@[^@]+$'
          then split_part(e, '@', 2)
          else null
        end as domain
      from norm
    )
  select case
    when (select e from norm) is null then false
    when (select e from parts) in (
      'anonymous@anonymous.com',
      'anonymous@anon.com',
      'anon@anon.com',
      'anon@anonymous.com',
      'none@none.com',
      'n/a@n/a.com',
      'na@na.com',
      'test@test.com',
      'noreply@noreply.com',
      'no-reply@noreply.com',
      'fake@fake.com',
      'placeholder@placeholder.com',
      'unknown@unknown.com'
    ) then true
    when (select domain from parts) in (
      'anonymous.com','anon.com','none.com','n/a.com','na.com',
      'noreply.com','fake.com','placeholder.com','unknown.com',
      'test.com','example.com','example.org','example.net','tbd.com'
    ) then true
    when (select local_part from parts) in (
      'anonymous','anon','none','n/a','na','noreply','no-reply',
      'fake','placeholder','unknown','test','tbd'
    )
      and (select domain from parts) ~ '^(.*\.)?(com|net|org|info)$'
      then true
    else false
  end;
$$ language sql immutable;

-- ── Rebuild movement_stats_by_state ──────────────────────────
-- Same body as migration 020, with one change: in the `keyed`
-- CTE, placeholder emails fall back to the per-row source key
-- the same way blank emails do.

drop view if exists movement_stats_by_state;
create view movement_stats_by_state as
with combined as (
  select
    'survey_submissions'::text                         as source_table,
    id                                                as source_id,
    nullif(upper(trim(state_of_occurrence)), '')      as state_us,
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))    as state,
    (nullif(upper(trim(state_of_occurrence)), '') is not null) as is_us,
    nullif(lower(trim(email)), '')                    as email_key,
    nullif(lower(trim(case_county)), '')              as case_county_norm,
    total_financial_loss::bigint                      as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    is_pro_se                                         as is_pro_se_bool,
    approved,
    created_at,
    0                                                 as source_priority,
    attorney_fees, gal_fees, therapy_eval_fees, reunification_fees,
    other_court_actors_fees, lost_wages, asset_liquidation_loss
  from survey_submissions
  union all
  select
    'legacy_submissions'::text                        as source_table,
    id                                                as source_id,
    nullif(upper(trim(state_of_occurrence)), '')      as state_us,
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))    as state,
    (nullif(upper(trim(state_of_occurrence)), '') is not null) as is_us,
    nullif(lower(trim(email)), '')                    as email_key,
    nullif(lower(trim(case_county)), '')              as case_county_norm,
    total_financial_loss::bigint                      as total_financial_loss,
    months_lost_parenting_time,
    custody_status,
    (is_pro_se ilike 'yes%')                          as is_pro_se_bool,
    false                                             as approved,
    created_at,
    1                                                 as source_priority,
    attorney_fees, gal_fees, therapy_eval_fees, reunification_fees,
    other_court_actors_fees, lost_wages, asset_liquidation_loss
  from legacy_submissions
  where (nullif(upper(trim(state_of_occurrence)), '') is not null)
     or (nullif(trim(outside_us_country), '') is not null)
),
with_decisions as (
  select
    c.*,
    d.decision
  from combined c
  left join admin_review_decisions d
    on d.source_table = c.source_table
   and d.source_id = c.source_id
   and d.decision = 'count_separately'
),
keyed as (
  select
    *,
    case
      when decision = 'count_separately'
        then source_table || ':' || source_id::text
      -- Placeholder emails fall back to the per-row source key so
      -- they do not auto-collide. Mirrors lib/placeholder-emails.ts
      -- and isPlaceholderEmail() in the API review route.
      when email_key is not null and _is_placeholder_email(email_key)
        then 'placeholder:' || source_table || ':' || source_id::text
      else coalesce(email_key, source_table || ':' || source_id::text)
    end as reporting_family_key
  from with_decisions
),
pass1_deduped as (
  select distinct on (reporting_family_key, state)
    state, state_us, is_us,
    case_county_norm, source_table, source_id, decision,
    total_financial_loss, months_lost_parenting_time,
    custody_status, is_pro_se_bool, approved, created_at,
    source_priority,
    attorney_fees, gal_fees, therapy_eval_fees, reunification_fees,
    other_court_actors_fees, lost_wages, asset_liquidation_loss
  from keyed
  order by reporting_family_key, state, source_priority asc, created_at desc nulls last
),
fingerprinted as (
  select
    *,
    case
      when (
        coalesce(attorney_fees, 0)              > 0
        or coalesce(gal_fees, 0)                > 0
        or coalesce(therapy_eval_fees, 0)       > 0
        or coalesce(reunification_fees, 0)      > 0
        or coalesce(other_court_actors_fees, 0) > 0
        or coalesce(lost_wages, 0)              > 0
        or coalesce(asset_liquidation_loss, 0)  > 0
        or coalesce(months_lost_parenting_time, 0) > 0
      )
      then concat_ws(
        '|',
        coalesce(state_us, ''),
        coalesce(case_county_norm, ''),
        coalesce(round(attorney_fees::numeric, 2)::text, ''),
        coalesce(round(gal_fees::numeric, 2)::text, ''),
        coalesce(round(therapy_eval_fees::numeric, 2)::text, ''),
        coalesce(round(reunification_fees::numeric, 2)::text, ''),
        coalesce(round(other_court_actors_fees::numeric, 2)::text, ''),
        coalesce(round(lost_wages::numeric, 2)::text, ''),
        coalesce(round(asset_liquidation_loss::numeric, 2)::text, ''),
        coalesce(months_lost_parenting_time::text, '')
      )
      else null
    end as financial_fingerprint
  from pass1_deduped
),
pass2_ranked as (
  select
    *,
    row_number() over (
      partition by case
        when financial_fingerprint is null
          or decision = 'count_separately'
          then 'BYPASS:' || source_table || ':' || source_id::text
        else financial_fingerprint
      end
      order by source_priority asc, created_at desc nulls last
    ) as fp_rank
  from fingerprinted
),
deduped as (
  select state, is_us, total_financial_loss, months_lost_parenting_time,
         custody_status, is_pro_se_bool, approved, created_at
  from pass2_ranked
  where fp_rank = 1
)
select
  state,
  is_us,
  count(*)                                          as total_submissions,
  count(*) filter (where approved)                  as approved_count,
  round(avg(case when total_financial_loss <= 5000000
                 then total_financial_loss else null end)::numeric, 2)
                                                    as avg_financial_loss,
  round(sum(case when total_financial_loss <= 5000000
                 then total_financial_loss else null end)::numeric, 2)
                                                    as total_financial_loss,
  round(avg(case when months_lost_parenting_time <= 360
                 then months_lost_parenting_time else null end)::numeric, 1)
                                                    as avg_months_lost,
  count(*) filter (where custody_status = 'No Contact / Total Loss of Access')
                                                    as total_loss_count,
  count(*) filter (where is_pro_se_bool)            as pro_se_count,
  max(created_at)                                   as last_submission_at
from deduped
where state is not null
group by state, is_us
order by total_submissions desc;

-- ── Rebuild movement_deduped_submissions (per-row deduped view) ──
-- Same body as migration 021, with the same placeholder-email
-- patch in the `keyed` CTE.

drop view if exists movement_deduped_submissions;
create view movement_deduped_submissions as
with combined as (
  select
    'survey_submissions'::text                          as source_table,
    id                                                  as source_id,
    nullif(upper(trim(state_of_occurrence)), '')        as state_us,
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))      as state,
    (nullif(upper(trim(state_of_occurrence)), '') is not null) as is_us,
    state_of_occurrence,
    outside_us_country,
    nullif(lower(trim(email)), '')                      as email_key,
    email,
    nullif(lower(trim(case_county)), '')                as case_county_norm,
    case_county,
    first_name,
    permission_to_share,
    impact_quote,
    case_status,
    system_affected,
    time_in_system,
    custody_status,
    number_of_kids,
    case
      when is_pro_se is true  then 'Yes, I am Pro Se (Representing myself)'
      when is_pro_se is false then 'No, I have an attorney'
      else null
    end                                                 as is_pro_se,
    is_pro_se                                           as is_pro_se_bool,
    legal_rep_history,
    allegation_type,
    months_lost_parenting_time,
    total_financial_loss::bigint                        as total_financial_loss,
    attorney_fees, gal_fees, therapy_eval_fees, reunification_fees,
    other_court_actors_fees, lost_wages, asset_liquidation_loss,
    approved,
    created_at,
    0                                                   as source_priority
  from survey_submissions
  union all
  select
    'legacy_submissions'::text                          as source_table,
    id                                                  as source_id,
    nullif(upper(trim(state_of_occurrence)), '')        as state_us,
    coalesce(nullif(upper(trim(state_of_occurrence)), ''),
             nullif(trim(outside_us_country), ''))      as state,
    (nullif(upper(trim(state_of_occurrence)), '') is not null) as is_us,
    state_of_occurrence,
    outside_us_country,
    nullif(lower(trim(email)), '')                      as email_key,
    email,
    nullif(lower(trim(case_county)), '')                as case_county_norm,
    case_county,
    first_name,
    permission_to_share,
    impact_quote,
    case_status,
    system_affected,
    time_in_system,
    custody_status,
    number_of_kids,
    is_pro_se,
    (is_pro_se ilike 'yes%')                            as is_pro_se_bool,
    legal_rep_history,
    allegation_type,
    months_lost_parenting_time,
    total_financial_loss::bigint                        as total_financial_loss,
    attorney_fees, gal_fees, therapy_eval_fees, reunification_fees,
    other_court_actors_fees, lost_wages, asset_liquidation_loss,
    false                                               as approved,
    created_at,
    1                                                   as source_priority
  from legacy_submissions
  where (nullif(upper(trim(state_of_occurrence)), '') is not null)
     or (nullif(trim(outside_us_country), '') is not null)
),
with_decisions as (
  select c.*, d.decision
  from combined c
  left join admin_review_decisions d
    on d.source_table = c.source_table
   and d.source_id = c.source_id
   and d.decision = 'count_separately'
),
keyed as (
  select
    *,
    case
      when decision = 'count_separately'
        then source_table || ':' || source_id::text
      when email_key is not null and _is_placeholder_email(email_key)
        then 'placeholder:' || source_table || ':' || source_id::text
      else coalesce(email_key, source_table || ':' || source_id::text)
    end as reporting_family_key
  from with_decisions
),
pass1_deduped as (
  select distinct on (reporting_family_key, state) *
  from keyed
  order by reporting_family_key, state, source_priority asc, created_at desc nulls last
),
fingerprinted as (
  select
    *,
    case
      when (
        coalesce(attorney_fees, 0)              > 0
        or coalesce(gal_fees, 0)                > 0
        or coalesce(therapy_eval_fees, 0)       > 0
        or coalesce(reunification_fees, 0)      > 0
        or coalesce(other_court_actors_fees, 0) > 0
        or coalesce(lost_wages, 0)              > 0
        or coalesce(asset_liquidation_loss, 0)  > 0
        or coalesce(months_lost_parenting_time, 0) > 0
      )
      then concat_ws(
        '|',
        coalesce(state_us, ''),
        coalesce(case_county_norm, ''),
        coalesce(round(attorney_fees::numeric, 2)::text, ''),
        coalesce(round(gal_fees::numeric, 2)::text, ''),
        coalesce(round(therapy_eval_fees::numeric, 2)::text, ''),
        coalesce(round(reunification_fees::numeric, 2)::text, ''),
        coalesce(round(other_court_actors_fees::numeric, 2)::text, ''),
        coalesce(round(lost_wages::numeric, 2)::text, ''),
        coalesce(round(asset_liquidation_loss::numeric, 2)::text, ''),
        coalesce(months_lost_parenting_time::text, '')
      )
      else null
    end as financial_fingerprint
  from pass1_deduped
),
pass2_ranked as (
  select
    *,
    row_number() over (
      partition by case
        when financial_fingerprint is null
          or decision = 'count_separately'
          then 'BYPASS:' || source_table || ':' || source_id::text
        else financial_fingerprint
      end
      order by source_priority asc, created_at desc nulls last
    ) as fp_rank
  from fingerprinted
)
select
  source_table,
  source_id,
  state,
  state_us,
  is_us,
  state_of_occurrence,
  outside_us_country,
  email,
  case_county,
  first_name,
  permission_to_share,
  impact_quote,
  case_status,
  system_affected,
  time_in_system,
  custody_status,
  number_of_kids,
  is_pro_se,
  legal_rep_history,
  allegation_type,
  months_lost_parenting_time,
  total_financial_loss,
  attorney_fees, gal_fees, therapy_eval_fees, reunification_fees,
  other_court_actors_fees, lost_wages, asset_liquidation_loss,
  approved,
  created_at,
  source_priority
from pass2_ranked
where fp_rank = 1
  and state is not null;

revoke all on movement_deduped_submissions from anon;
grant select on movement_deduped_submissions to authenticated, service_role;
