
-- Create a trigger function to call the fetch-trusted-sources edge function
CREATE OR REPLACE FUNCTION public.trigger_fetch_trusted_sources()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  req_id BIGINT;
BEGIN
  -- Invoke the fetch-trusted-sources Edge Function
  req_id := net.http_post(
    url     := 'http://127.0.0.1:54321/functions/v1/fetch-trusted-sources',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer '
    ),
    body    := '{}'::jsonb
  );

  RAISE NOTICE 'Triggered fetch-trusted-sources, request_id=%', req_id;
  RETURN req_id;
END;
$function$;

-- Create a function to schedule the fetch-trusted-sources cron job
CREATE OR REPLACE FUNCTION public.create_fetch_trusted_sources_cron_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  job_id bigint;
  func_sql text;
BEGIN
  -- First check if the job already exists
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'fetch_trusted_sources_every_3_days';
  
  -- If job already exists, remove it first
  IF FOUND THEN
    PERFORM cron.unschedule(job_id);
  END IF;
  
  -- Define the SQL command to trigger the function
  func_sql := 'SELECT public.trigger_fetch_trusted_sources();';
  
  -- Create the job to run every 3 days at midnight
  SELECT cron.schedule('fetch_trusted_sources_every_3_days', '0 0 */3 * *', func_sql) INTO job_id;
  
  RETURN 'Cron job created with ID: ' || job_id;
END;
$function$;
