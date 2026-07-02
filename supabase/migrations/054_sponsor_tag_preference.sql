-- Add sponsor recognition preferences to contribution records.
-- Captured on the sponsor checkout form and stored when Stripe webhook lands.

alter table connection_circle_sponsor_contributions
  add column if not exists sponsor_name text,
  add column if not exists tag_permission text check (tag_permission in ('tag', 'first_name', 'anonymous')),
  add column if not exists social_handle text;

comment on column connection_circle_sponsor_contributions.sponsor_name is
  'Display name the sponsor provided for recognition (may be a handle or full name).';
comment on column connection_circle_sponsor_contributions.tag_permission is
  'tag = tag social_handle in posts; first_name = use sponsor_name only; anonymous = do not name them.';
comment on column connection_circle_sponsor_contributions.social_handle is
  'Social handle to tag, e.g. @username, if tag_permission is tag.';
