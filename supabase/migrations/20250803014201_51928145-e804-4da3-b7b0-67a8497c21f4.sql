-- Enhanced device token management functions

-- Function to save device token with improved logic
CREATE OR REPLACE FUNCTION public.save_device_token_enhanced(
  p_token text, 
  p_platform text, 
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_token text;
  affected_rows integer := 0;
  result jsonb;
BEGIN
  -- Check if this exact token already exists for this user
  SELECT token INTO existing_token 
  FROM public.device_tokens 
  WHERE user_id = p_user_id AND token = p_token AND is_active = true;
  
  -- If token already exists and is active, no need to update
  IF existing_token IS NOT NULL THEN
    result := jsonb_build_object(
      'action', 'no_change',
      'message', 'Token already exists and is active',
      'token_updated', false
    );
    RETURN result;
  END IF;
  
  -- Deactivate all existing tokens for this user/platform combination
  UPDATE public.device_tokens 
  SET is_active = false, updated_at = now()
  WHERE user_id = p_user_id 
    AND platform = p_platform 
    AND is_active = true
    AND token != p_token;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  
  -- Insert or reactivate the new token
  INSERT INTO public.device_tokens (token, platform, user_id, is_active)
  VALUES (p_token, p_platform, p_user_id, true)
  ON CONFLICT (token, user_id) 
  DO UPDATE SET 
    is_active = true,
    platform = p_platform,
    updated_at = now();
  
  result := jsonb_build_object(
    'action', 'token_saved',
    'message', 'Token saved successfully',
    'token_updated', true,
    'old_tokens_deactivated', affected_rows
  );
  
  RETURN result;
END;
$$;

-- Function to cleanup invalid/expired tokens
CREATE OR REPLACE FUNCTION public.cleanup_invalid_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer := 0;
  deactivated_count integer := 0;
BEGIN
  -- Delete tokens older than 90 days that are inactive
  DELETE FROM public.device_tokens 
  WHERE is_active = false 
    AND updated_at < now() - interval '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Deactivate tokens older than 30 days that haven't been updated
  UPDATE public.device_tokens 
  SET is_active = false, updated_at = now()
  WHERE is_active = true 
    AND updated_at < now() - interval '30 days';
  
  GET DIAGNOSTICS deactivated_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'deleted_old_tokens', deleted_count,
    'deactivated_stale_tokens', deactivated_count,
    'cleanup_completed_at', now()
  );
END;
$$;

-- Function to rotate tokens for a user (when switching devices)
CREATE OR REPLACE FUNCTION public.rotate_user_tokens(
  p_user_id uuid,
  p_new_token text,
  p_platform text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_tokens_count integer := 0;
BEGIN
  -- Deactivate all existing tokens for this user/platform
  UPDATE public.device_tokens 
  SET is_active = false, updated_at = now()
  WHERE user_id = p_user_id 
    AND platform = p_platform 
    AND is_active = true;
  
  GET DIAGNOSTICS old_tokens_count = ROW_COUNT;
  
  -- Insert the new token
  INSERT INTO public.device_tokens (token, platform, user_id, is_active)
  VALUES (p_new_token, p_platform, p_user_id, true)
  ON CONFLICT (token, user_id) 
  DO UPDATE SET 
    is_active = true,
    platform = p_platform,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'action', 'tokens_rotated',
    'old_tokens_deactivated', old_tokens_count,
    'new_token_activated', true,
    'rotated_at', now()
  );
END;
$$;

-- Function to get token statistics for monitoring
CREATE OR REPLACE FUNCTION public.get_token_statistics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_tokens', COUNT(*),
    'active_tokens', COUNT(*) FILTER (WHERE is_active = true),
    'inactive_tokens', COUNT(*) FILTER (WHERE is_active = false),
    'android_tokens', COUNT(*) FILTER (WHERE platform = 'android' AND is_active = true),
    'ios_tokens', COUNT(*) FILTER (WHERE platform = 'ios' AND is_active = true),
    'tokens_updated_last_24h', COUNT(*) FILTER (WHERE updated_at > now() - interval '24 hours'),
    'oldest_active_token', MIN(created_at) FILTER (WHERE is_active = true),
    'newest_token', MAX(created_at)
  ) INTO stats
  FROM public.device_tokens;
  
  RETURN stats;
END;
$$;

-- Function to handle token refresh errors and mark tokens as potentially invalid
CREATE OR REPLACE FUNCTION public.mark_token_invalid(
  p_token text,
  p_error_reason text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  token_found boolean := false;
BEGIN
  -- Mark token as inactive and add error info
  UPDATE public.device_tokens 
  SET 
    is_active = false, 
    updated_at = now()
  WHERE token = p_token AND is_active = true;
  
  token_found := FOUND;
  
  -- Log the error reason if provided
  IF token_found AND p_error_reason IS NOT NULL THEN
    -- You could extend this to log to a separate error tracking table
    RAISE NOTICE 'Token % marked invalid: %', p_token, p_error_reason;
  END IF;
  
  RETURN token_found;
END;
$$;