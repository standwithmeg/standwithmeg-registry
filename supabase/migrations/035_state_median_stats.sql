-- Clean per-state medians from the DEDUPED dataset (one row per family =
-- email+state, matching movement_stats_by_state's dedup). The avg_/total_
-- financial-loss + months-lost fields are wrecked by duplicate rows and outlier
-- entries (someone typed $100M / 800,000 months). Deduping + a median + sanity
-- bounds gives the SAFE, publishable numbers for state pages, PDFs, and the pitch.

create or replace view public.state_median_stats as
with deduped as (
  select distinct on (coalesce(nullif(lower(trim(email)), ''), id::text), state_of_occurrence)
    state_of_occurrence as state,
    total_financial_loss,
    months_lost_parenting_time
  from public.survey_submissions
  where state_of_occurrence is not null
)
select
  state,
  count(*) filter (where total_financial_loss between 1 and 50000000) as loss_n,
  percentile_cont(0.5) within group (order by total_financial_loss)
    filter (where total_financial_loss between 1 and 50000000) as median_financial_loss,
  count(*) filter (where months_lost_parenting_time between 1 and 600) as months_n,
  percentile_cont(0.5) within group (order by months_lost_parenting_time)
    filter (where months_lost_parenting_time between 1 and 600) as median_months_lost
from deduped
group by state;
