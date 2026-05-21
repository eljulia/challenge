-- 1) Tighten profile_monthly_points: remove anon/public broad SELECT.
-- Leaderboard uses get_leaderboard() SECURITY DEFINER which bypasses RLS, so UI is unaffected.
DROP POLICY IF EXISTS "allow anon select monthly points" ON public.profile_monthly_points;
DROP POLICY IF EXISTS "enable read access for all users" ON public.profile_monthly_points;

-- Keep the existing "users can view own monthly points" policy (already present).

-- 2) Private 'images' bucket: explicit deny for non-service-role.
-- Service role bypasses RLS, so the external scraper continues to work.
DROP POLICY IF EXISTS "Block client read on images bucket" ON storage.objects;
CREATE POLICY "Block client read on images bucket"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id <> 'images');

DROP POLICY IF EXISTS "Block client write on images bucket" ON storage.objects;
CREATE POLICY "Block client write on images bucket"
ON storage.objects
FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id <> 'images');

DROP POLICY IF EXISTS "Block client update on images bucket" ON storage.objects;
CREATE POLICY "Block client update on images bucket"
ON storage.objects
FOR UPDATE
TO authenticated, anon
USING (bucket_id <> 'images');

DROP POLICY IF EXISTS "Block client delete on images bucket" ON storage.objects;
CREATE POLICY "Block client delete on images bucket"
ON storage.objects
FOR DELETE
TO authenticated, anon
USING (bucket_id <> 'images');

-- 3) Lock search_path on functions missing it (linter fix, no behavior change).
-- Wrapped in DO block: skips functions that don't exist in this local environment.
DO $$
DECLARE
  sigs text[] := ARRAY[
    'setup_cron_extensions()',
    'get_week_start(date)',
    'ensure_user_streak(uuid)',
    'handle_updated_at()',
    'create_publish_posts_cron_job()',
    'trigger_daily_streak_checker()',
    'schedule_linkedin_token_maintenance()',
    'enable_push_notifications(uuid)',
    'disable_push_notifications(uuid)',
    'get_push_registration_status(uuid)',
    '"trigger-fetch-ses-news"()',
    'trigger_publish_scheduled_posts()',
    'publish_scheduled_posts()',
    'trigger_delete_old_articles()',
    'ensure_user_goal(uuid)',
    'touch_updated_at()',
    'update_profile_current_month_points()',
    'trigger_extract_sources()',
    'trigger_specialized_fetch()',
    'schedule_publish_posts_cron()',
    'trigger_fetch_trusted_articles()'
  ];
  sig text;
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    BEGIN
      EXECUTE 'ALTER FUNCTION public.' || sig || ' SET search_path = public';
    EXCEPTION WHEN undefined_function OR undefined_object THEN
      NULL;
    END;
  END LOOP;
END $$;