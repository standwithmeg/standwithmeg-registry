-- Supabase Advisor: Security Definer View
--
-- These reporting/public-safety views should evaluate permissions as the
-- caller instead of the view owner. Server routes that need elevated access
-- still use the service_role key, while direct anon/authenticated access must
-- pass the underlying table RLS policies.

ALTER VIEW IF EXISTS public.movement_deduped_submissions SET (security_invoker = true);
ALTER VIEW IF EXISTS public.court_actors_public_safe SET (security_invoker = true);
ALTER VIEW IF EXISTS public.survey_stats_by_state SET (security_invoker = true);
ALTER VIEW IF EXISTS public.movement_stats_by_state SET (security_invoker = true);
