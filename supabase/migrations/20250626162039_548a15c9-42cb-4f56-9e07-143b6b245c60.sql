
-- Add columns to articles table to store OpenAI analysis results
ALTER TABLE public.articles 
ADD COLUMN IF NOT EXISTS openai_analysis jsonb,
ADD COLUMN IF NOT EXISTS analysis_score numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_analyzed_at timestamp with time zone;

-- Create index on analysis score for better query performance
CREATE INDEX IF NOT EXISTS idx_articles_analysis_score ON public.articles(analysis_score DESC);

-- Create index on last_analyzed_at for tracking analysis freshness
CREATE INDEX IF NOT EXISTS idx_articles_last_analyzed_at ON public.articles(last_analyzed_at);

-- Add rate limiting table for OpenAI API calls
CREATE TABLE IF NOT EXISTS public.openai_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL DEFAULT CURRENT_DATE,
  call_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(date)
);

-- Create trigger for updated_at on rate limits table
CREATE OR REPLACE TRIGGER set_updated_at_openai_rate_limits
  BEFORE UPDATE ON public.openai_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
