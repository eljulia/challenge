
-- Add keyword and language columns to articles table
ALTER TABLE articles 
ADD COLUMN keywords TEXT[] DEFAULT '{}',
ADD COLUMN article_language TEXT DEFAULT 'English';

-- Create article_categories table for better categorization
CREATE TABLE article_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_articles_keywords ON articles USING GIN(keywords);
CREATE INDEX idx_articles_language ON articles(article_language);
CREATE INDEX idx_articles_publication_date ON articles(publicationdate);
CREATE INDEX idx_article_categories_article_id ON article_categories(article_id);
CREATE INDEX idx_article_categories_category ON article_categories(category);

-- Add enhanced user preferences for keyword learning
ALTER TABLE profiles 
ADD COLUMN keyword_weights JSONB DEFAULT '{}',
ADD COLUMN interaction_history JSONB DEFAULT '[]';

-- Create user_article_interactions table for feedback learning
CREATE TABLE user_article_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('viewed', 'selected', 'generated_post', 'skipped', 'liked', 'disliked')),
  interaction_weight DECIMAL(3,2) DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_interactions_user_id ON user_article_interactions(user_id);
CREATE INDEX idx_user_interactions_article_id ON user_article_interactions(article_id);
CREATE INDEX idx_user_interactions_type ON user_article_interactions(interaction_type);
