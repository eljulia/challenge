-- Initial base schema. All subsequent migrations are incremental ALTER TABLE / CREATE TABLE.
-- Columns added by later migrations are intentionally absent here.
-- Tables created by specific migrations (user_articles, allowed_emails) are also absent.

-- ── Helper trigger functions ─────────────────────────────────────────────────

-- handle_updated_at: sets updated_at = now() on every UPDATE row
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- touch_updated_at: alias used by later migrations (app_versions, user_style_profiles)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- get_week_start: returns the Monday of the week containing the given date.
-- Called both as get_week_start(date) and get_week_start() (no-arg).
-- The no-arg variant defaults to CURRENT_DATE.
CREATE OR REPLACE FUNCTION public.get_week_start(d date DEFAULT CURRENT_DATE)
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT date_trunc('week', d)::date;
$$;

-- handle_new_user: auto-creates a profiles row when a new auth.users row is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Wire handle_new_user to auth.users inserts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Core tables ──────────────────────────────────────────────────────────────

-- profiles (keyword_weights/interaction_history added by 20250626142028,
--           push_enabled added by 20250803010137, your_thoughts by 20260416132458)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name              TEXT,
  avatar_url                TEXT,
  preferences               JSONB,
  consents                  JSONB,
  linkedin_token            TEXT,
  linkedin_token_expires_at TIMESTAMPTZ,
  current_month_points      INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- sources (user_id added by 20251120134109)
CREATE TABLE IF NOT EXISTS public.sources (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                         TEXT NOT NULL,
  apiurl                       TEXT NOT NULL,
  type                         TEXT NOT NULL,
  language                     TEXT,
  industries                   TEXT[],
  locations                    TEXT[],
  article_extraction_hints     JSONB NOT NULL DEFAULT '{}',
  article_url_patterns         JSONB,
  article_url_exclude_patterns JSONB,
  extraction_limit             INTEGER NOT NULL DEFAULT 10,
  lastfetched                  TIMESTAMPTZ,
  last_inspected_at            TIMESTAMPTZ,
  need_filter                  BOOLEAN,
  processed                    BOOLEAN
);

-- articles (keywords/article_language added by 20250626142028)
CREATE TABLE IF NOT EXISTS public.articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  imageurl        TEXT NOT NULL DEFAULT '',
  content         TEXT,
  summary         TEXT,
  publicationdate TEXT,
  retrievedat     TIMESTAMPTZ,
  sourceid        UUID REFERENCES public.sources(id),
  industries      TEXT[],
  locations       JSONB,
  normalized_url  TEXT
);

-- posts (impersonated_by added later with IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  article_id        UUID NOT NULL,
  content           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'revision',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ai_content        TEXT,
  linkedin_post_url TEXT,
  scheduled_for     TIMESTAMPTZ,
  CONSTRAINT posts_user_id_fkey    FOREIGN KEY (user_id)    REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT posts_article_id_fk   FOREIGN KEY (article_id) REFERENCES public.articles(id)
);

CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Supporting tables (no CREATE TABLE in any migration) ─────────────────────

-- notification_events
CREATE TABLE IF NOT EXISTS public.notification_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT,
  entity_id  UUID,
  payload    JSONB,
  processed  BOOLEAN DEFAULT false
);
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

-- user_notifications
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id   BIGINT NOT NULL REFERENCES public.notification_events(id) ON DELETE CASCADE,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status     TEXT NOT NULL
);
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- specialized-extraction (quoted because of the hyphen)
CREATE TABLE IF NOT EXISTS public."specialized-extraction" (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount      INTEGER,
  extracted   BOOLEAN,
  keywords    TEXT,
  language    TEXT,
  "lastLink"  TEXT,
  person_id   TEXT,
  person_name TEXT,
  region      TEXT
);
ALTER TABLE public."specialized-extraction" ENABLE ROW LEVEL SECURITY;

-- user_goals
CREATE TABLE IF NOT EXISTS public.user_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  target_posts    INTEGER NOT NULL DEFAULT 4,
  completed_posts INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

-- user_streaks
CREATE TABLE IF NOT EXISTS public.user_streaks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak     INTEGER NOT NULL DEFAULT 0,
  longest_streak     INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

-- profile_monthly_points
CREATE TABLE IF NOT EXISTS public.profile_monthly_points (
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  points       INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, period_start)
);
ALTER TABLE public.profile_monthly_points ENABLE ROW LEVEL SECURITY;

-- editorial_configs
CREATE TABLE IF NOT EXISTS public.editorial_configs (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  display_name     TEXT,
  editorial_prompt TEXT,
  summary_prompt   TEXT
);
ALTER TABLE public.editorial_configs ENABLE ROW LEVEL SECURITY;
