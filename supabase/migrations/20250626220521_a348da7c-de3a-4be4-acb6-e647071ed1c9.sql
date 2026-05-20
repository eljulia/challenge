
-- Remove the OpenAI analysis columns from articles table
ALTER TABLE public.articles 
DROP COLUMN IF EXISTS openai_analysis,
DROP COLUMN IF EXISTS analysis_score,
DROP COLUMN IF EXISTS last_analyzed_at;

-- Drop the indexes we created for analysis
DROP INDEX IF EXISTS idx_articles_analysis_score;
DROP INDEX IF EXISTS idx_articles_last_analyzed_at;

-- Drop the rate limiting table since we're not using complex analysis anymore
DROP TABLE IF EXISTS public.openai_rate_limits;
