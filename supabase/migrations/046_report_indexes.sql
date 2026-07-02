-- Performance indexes for /report page and court-actor aggregation queries.
-- These composite indexes cover the ordered, filtered scans used when
-- building public actor buckets and state breakdowns.

-- Faster paginated scan of form_direct rows ordered by id.
create index if not exists idx_court_actors_source_id
  on court_actors (source, id);

-- Faster state-filtered scans when building state-specific actor lists.
create index if not exists idx_court_actors_source_state_id
  on court_actors (source, state_code, id);

-- Faster location-key-filtered scans for international breakdowns.
create index if not exists idx_court_actors_source_location_id
  on court_actors (source, location_key, id);

-- Supports bucketing/grouping by normalized name + role + location.
create index if not exists idx_court_actors_name_lower_role_state
  on court_actors (lower(name), role, state_code);

-- Foreign-key lookups from the safety view and bucket builder.
-- Alias decisions are keyed by cluster_key/location_key/name_keys, not actor_id.
create index if not exists idx_court_actor_alias_decisions_cluster_key
  on court_actor_alias_decisions (cluster_key);

create index if not exists idx_court_actor_row_review_row_id
  on court_actor_row_review (row_id);

-- Index on the decision fields already used for filtering.
create index if not exists idx_admin_review_decisions_source_id
  on admin_review_decisions (source_table, source_id);
