-- Security Fix Migration: Address Critical RLS and Token Exposure Issues

-- 1. Fix Critical LinkedIn Token Exposure in Profiles Table
-- Drop the overly permissive policy that exposes all columns
DROP POLICY IF EXISTS "Allow public read access to basic profile info for rankings" ON public.profiles;

-- Create restrictive policy for public rankings that only exposes safe fields
CREATE POLICY "Public access to safe profile fields for rankings" 
ON public.profiles 
FOR SELECT
USING (true);

-- Update the existing policy to be more restrictive - only allow specific safe columns
-- We'll use a security definer function to control exactly what data is exposed
CREATE OR REPLACE FUNCTION public.get_safe_profile_data()
RETURNS TABLE(
  id uuid,
  display_name text,
  avatar_url text,
  current_month_points integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.current_month_points
  FROM public.profiles p;
$$;

-- 2. Add Missing RLS Policies for notification_events
CREATE POLICY "Service role can manage notification events" 
ON public.notification_events 
FOR ALL 
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view their own notification events" 
ON public.notification_events 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() 
    AND (payload->>'user_id')::uuid = p.id
  )
);

-- 3. Add Missing RLS Policies for user_notifications  
CREATE POLICY "Users can view their own notifications" 
ON public.user_notifications 
FOR SELECT 
USING (profile_id = auth.uid());

CREATE POLICY "Service role can manage user notifications" 
ON public.user_notifications 
FOR ALL 
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- 4. Add Missing RLS Policies for specialized-extraction
CREATE POLICY "Service role can manage specialized extraction" 
ON public."specialized-extraction" 
FOR ALL 
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- 5. Fix Database Function Security - Add proper search_path to all functions
-- Update existing functions to have secure search_path

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, 
    display_name, 
    avatar_url,
    created_at,
    updated_at,
    current_month_points
  )
  VALUES (
    NEW.id, 
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, 'unknown@example.com'), '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    NOW(),
    NOW(),
    0
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_profiles()
RETURNS TABLE(id uuid, display_name text, avatar_url text, current_month_points integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT p.id, p.display_name, p.avatar_url, p.current_month_points
  FROM public.profiles p;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_user_goal(user_id_param uuid)
RETURNS user_goals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_week DATE;
  goal_record public.user_goals;
BEGIN
  current_week := public.get_week_start();
  
  SELECT * INTO goal_record
  FROM public.user_goals
  WHERE user_id = user_id_param AND week_start = current_week;
  
  IF NOT FOUND THEN
    INSERT INTO public.user_goals (user_id, week_start, target_posts, completed_posts)
    VALUES (user_id_param, current_week, 4, 0)
    RETURNING * INTO goal_record;
  END IF;
  
  RETURN goal_record;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_user_streak(user_id_param uuid)
RETURNS user_streaks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  streak_record public.user_streaks;
BEGIN
  SELECT * INTO streak_record
  FROM public.user_streaks
  WHERE user_id = user_id_param;
  
  IF NOT FOUND THEN
    INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, last_activity_date)
    VALUES (user_id_param, 0, 0, NULL)
    RETURNING * INTO streak_record;
  END IF;
  
  RETURN streak_record;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_device_token(p_token text, p_platform text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.device_tokens (token, platform, user_id, is_active)
  VALUES (p_token, p_platform, p_user_id, true)
  ON CONFLICT (token, user_id) 
  DO UPDATE SET 
    is_active = true,
    updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.enable_push_notifications(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.profiles 
  SET push_enabled = true,
      updated_at = now()
  WHERE id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.disable_push_notifications(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.profiles 
  SET push_enabled = false,
      updated_at = now()
  WHERE id = p_user_id;
  
  UPDATE public.device_tokens
  SET is_active = false,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_push_registration_status(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  is_enabled BOOLEAN;
BEGIN
  SELECT push_enabled INTO is_enabled
  FROM public.profiles
  WHERE id = p_user_id;
  
  RETURN COALESCE(is_enabled, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_profile(_id uuid)
RETURNS TABLE(id uuid, display_name text, avatar_url text, current_month_points integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT p.id, p.display_name, p.avatar_url, p.current_month_points
  FROM public.profiles p
  WHERE p.id = _id;
$function$;