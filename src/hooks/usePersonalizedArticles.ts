
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import useProfileData from './useProfileData';
import { 
  calculateArticleScore,
  extractKeywords,
  updateKeywordWeights,
  type KeywordWeight,
  type UserInteraction,
  type ArticleScore
} from '@/utils/articleAnalysis';

interface Article {
  id: string;
  title: string;
  summary: string;  
  imageurl?: string;
  url: string;
  sourceid: string;
  industries?: string[];
  locations?: string[];
  language?: string;
  sourceName?: string;
  sourceType?: string;
  publicationdate?: string;
  retrievedat?: string;
  keywords?: string[];
  score?: ArticleScore;
  matchLevel?: number;
  isSESArticle?: boolean;
  isRecentAndInteresting?: boolean;
  reasoning?: string;
  isManuallyAdded?: boolean;
  manuallyAddedAt?: string;
}

// Type guard functions
const isKeywordWeight = (value: any): value is KeywordWeight => {
  return value && typeof value === 'object' && !Array.isArray(value);
};

const isStringArray = (value: any): value is string[] => {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
};

const toStringArray = (value: any): string[] => {
  if (isStringArray(value)) return value;
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
  return [];
};

export const usePersonalizedArticles = () => {
  const { user } = useAuth();
  const { preferences } = useProfileData();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const recordInteraction = useCallback(async (
    articleId: string,
    interactionType: 'viewed' | 'selected' | 'generated_post' | 'skipped' | 'liked' | 'disliked',
    articleKeywords?: string[]
  ) => {
    if (!user?.id) return;

    try {
      // Record interaction in database - using posts table as fallback since user_article_interactions doesn't exist
      await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          article_id: articleId,
          content: `${interactionType} interaction`,
          status: 'interaction'
        });

      // Keyword weights functionality removed

      console.log(`Recorded interaction: ${interactionType} for article ${articleId}`);
    } catch (error) {
      console.error('Error recording interaction:', error);
    }
  }, [user?.id]);

  const loadPersonalizedArticles = useCallback(async () => {
    if (!user?.id || !preferences) return;

    setIsLoading(true);
    try {
      console.log('Loading personalized articles with trusted media and location filtering');

      // Fetch user's manually added articles and general articles in parallel
      const [manualArticlesResult, rawArticlesResult] = await Promise.all([
        supabase
          .from('user_articles')
          .select(`
            created_at,
            articles:article_id (
              *,
              sources!articles_sourceid_fkey (
                name,
                type
              )
            )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('articles')
          .select(`
            *,
            sources(name, language, industries, locations, type)
          `)
          .order('publicationdate', { ascending: false })
          .limit(500)
      ]);

      const { data: manualArticlesData, error: manualError } = manualArticlesResult;
      const { data: rawArticles, error } = rawArticlesResult;

      if (error) throw error;
      if (manualError) console.error('Error fetching manual articles:', manualError);

      // Process manually added articles
      const manualArticles = (manualArticlesData || []).map((ua: any) => ({
        ...ua.articles,
        sourceName: ua.articles?.sources?.name || 'Manually Added',
        sourceType: 'manual',
        isManuallyAdded: true,
        manuallyAddedAt: ua.created_at,
        language: ua.articles?.article_language,
        industries: toStringArray(ua.articles?.industries),
        locations: toStringArray(ua.articles?.locations),
        keywords: toStringArray(ua.articles?.keywords),
      }));

      // Filter out articles with existing posts
      const { data: existingPosts } = await supabase
        .from('posts')
        .select('article_id')
        .eq('user_id', user.id);

      const existingArticleIds = existingPosts?.map(post => post.article_id) || [];
      
      let availableArticles = rawArticles?.filter(article => 
        !existingArticleIds.includes(article.id)
      ) || [];

      // Filter by trusted media sources
      const trustedMedia = preferences?.trustedMedia || [];
      if (trustedMedia.length > 0) {
        availableArticles = availableArticles.filter(article => 
          trustedMedia.includes(article.sources?.name || '')
        );
      }

      // Filter by location preference
      const userRegions = preferences?.region || [];
      if (userRegions.length > 0) {
        availableArticles = availableArticles.filter(article => {
          const articleLocations = toStringArray(article.sources?.locations || article.locations);
          
          // Always show Global articles
          if (articleLocations.includes('Global')) {
            return true;
          }
          
          // Check if any article location matches user regions
          return articleLocations.some(location => 
            userRegions.some(region => 
              location.toLowerCase().includes(region.toLowerCase()) || 
              region.toLowerCase().includes(location.toLowerCase())
            )
          );
        });
      }

      // Filter by language preferences - only show articles in preferred or second language
      const preferredLanguage = preferences?.preferredLanguage;
      const secondLanguage = preferences?.secondLanguage;
      
      if (preferredLanguage !== "None" || secondLanguage !== "None") {
        availableArticles = availableArticles.filter(article => {
          const articleLanguage = article.sources?.language || article.article_language;
          return (preferredLanguage !== "None" && articleLanguage === preferredLanguage) ||
                 (secondLanguage !== "None" && articleLanguage === secondLanguage);
        });
      }

      // Get user interaction history from posts table
      const { data: interactions } = await supabase
        .from('posts')
        .select('article_id, status, created_at')
        .eq('user_id', user.id)
        .eq('status', 'interaction')
        .order('created_at', { ascending: false })
        .limit(1000);

      const userInteractions: UserInteraction[] = interactions?.map(i => ({
        articleId: i.article_id,
        interactionType: 'viewed' as any,
        timestamp: i.created_at,
        weight: 1.0
      })) || [];

      // Keyword weights functionality removed
      const keywordWeights: KeywordWeight = {};

      const userKeywords = preferences?.keywords || [];
      const userIndustries = preferences?.industries || [];

      // Enhanced scoring with keyword priority and better second language visibility
      const scoredArticles = availableArticles.map((article) => {
        const mappedArticle: Article = {
          ...article,
          sourceName: article.sources?.name || 'Unknown Source',
          sourceType: article.sources?.type || 'general',
          language: article.sources?.language || article.article_language,
          industries: toStringArray(article.sources?.industries || article.industries),
          locations: toStringArray(article.sources?.locations || article.locations),
        };

        // Extract keywords and calculate base scores
        const keywords = toStringArray(article.keywords) || extractKeywords(article.title, article.summary);
        
        // Enhanced keyword matching score with higher weight
        const keywordMatches = keywords.filter(keyword => 
          userKeywords.some(userKeyword => 
            keyword.toLowerCase().includes(userKeyword.toLowerCase()) ||
            userKeyword.toLowerCase().includes(keyword.toLowerCase())
          )
        ).length;
        const keywordScore = userKeywords.length > 0 ? Math.min(1, keywordMatches / Math.max(1, userKeywords.length * 0.3)) : 0;

        // Industry matching score
        const industryMatches = mappedArticle.industries.filter(industry => 
          userIndustries.includes(industry)
        ).length;
        const industryScore = userIndustries.length > 0 ? industryMatches / userIndustries.length : 0;

        // Recency score (articles from last 30 days get full score, older ones decay)
        const publicationDate = article.publicationdate ? new Date(article.publicationdate) : null;
        const daysSincePublication = publicationDate ? 
          Math.max(0, (Date.now() - publicationDate.getTime()) / (1000 * 60 * 60 * 24)) : 30;
        const recencyScore = Math.max(0, 1 - (daysSincePublication / 30));

        // Language score
        let languageScore = 0;
        if (preferredLanguage !== "None" && mappedArticle.language === preferredLanguage) {
          languageScore = 1.0;
        } else if (secondLanguage !== "None" && mappedArticle.language === secondLanguage) {
          languageScore = 0.9; // Increased from 0.7 to boost second language visibility
        }

        // Calculate composite score with KEYWORD PRIORITY
        let totalScore = 0;
        
        if (mappedArticle.language === preferredLanguage) {
          // Preferred language: 60% keywords, 20% industry, 15% recency, 5% language
          totalScore = (keywordScore * 0.6) + (industryScore * 0.2) + (recencyScore * 0.15) + (languageScore * 0.05);
        } else if (mappedArticle.language === secondLanguage) {
          // Second language: 55% keywords, 20% industry, 15% recency, 10% language
          // Slightly reduced keyword weight but increased language weight for better visibility
          totalScore = (keywordScore * 0.55) + (industryScore * 0.2) + (recencyScore * 0.15) + (languageScore * 0.1);
        }

        // Add significant bonus for high keyword matches
        if (keywordScore > 0.7) {
          totalScore += 0.15;
        } else if (keywordScore > 0.4) {
          totalScore += 0.1;
        }

        // Add bonus for very recent articles (last 7 days)
        if (daysSincePublication <= 7) {
          totalScore += 0.05;
        }

        // Ensure score doesn't exceed 1.0
        totalScore = Math.min(1.0, totalScore);

        const enhancedScore: ArticleScore = {
          articleId: article.id,
          totalScore,
          languageScore,
          industryScore,
          locationScore: userRegions.length > 0 ? (mappedArticle.locations.includes('Global') ? 1 : 0.8) : 1,
          keywordScore,
          recencyScore,
          interactionScore: 0
        };

        const reasoning = `Keywords: ${(keywordScore * 100).toFixed(0)}%, Industry: ${(industryScore * 100).toFixed(0)}%, Recency: ${(recencyScore * 100).toFixed(0)}%`;

        return {
          ...mappedArticle,
          score: enhancedScore,
          reasoning,
          matchLevel: Math.ceil(totalScore * 5),
          isSESArticle: mappedArticle.sourceType === 'ses',
          isRecentAndInteresting: totalScore > 0.7
        };
      });

      // Enhanced sorting with better second language distribution
      const preferredArticles = scoredArticles.filter(a => a.language === preferredLanguage);
      const secondLanguageArticles = scoredArticles.filter(a => a.language === secondLanguage);
      
      // Sort each group by score
      preferredArticles.sort((a, b) => (b.score?.totalScore || 0) - (a.score?.totalScore || 0));
      secondLanguageArticles.sort((a, b) => (b.score?.totalScore || 0) - (a.score?.totalScore || 0));
      
      // Interleave articles for better second language visibility
      const sortedArticles: Article[] = [];
      const maxLength = Math.max(preferredArticles.length, secondLanguageArticles.length);
      
      for (let i = 0; i < maxLength; i++) {
        // Add 2-3 preferred language articles
        if (i < preferredArticles.length) {
          sortedArticles.push(preferredArticles[i]);
        }
        if (i + 1 < preferredArticles.length) {
          sortedArticles.push(preferredArticles[i + 1]);
        }
        
        // Add 1-2 second language articles
        if (i < secondLanguageArticles.length) {
          sortedArticles.push(secondLanguageArticles[i]);
        }
        if (i + 1 < secondLanguageArticles.length && Math.random() > 0.5) {
          sortedArticles.push(secondLanguageArticles[i + 1]);
        }
        
        i++; // Skip next iteration since we've already processed i+1
      }

      // Merge manual articles: recent ones (< 24h) at top, others by publication date
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const recentManualArticles = manualArticles.filter(a => 
        a.manuallyAddedAt && new Date(a.manuallyAddedAt) > twentyFourHoursAgo
      );
      
      const olderManualArticles = manualArticles.filter(a => 
        !a.manuallyAddedAt || new Date(a.manuallyAddedAt) <= twentyFourHoursAgo
      );

      // Remove duplicates from sorted articles if they exist in manual articles
      const manualArticleIds = new Set(manualArticles.map(a => a.id));
      const filteredSortedArticles = sortedArticles.filter(a => !manualArticleIds.has(a.id));

      // Merge older manual articles into sorted feed by publication date
      const mergedArticles = [...filteredSortedArticles, ...olderManualArticles].sort((a, b) => {
        const dateA = a.publicationdate ? new Date(a.publicationdate).getTime() : 0;
        const dateB = b.publicationdate ? new Date(b.publicationdate).getTime() : 0;
        return dateB - dateA;
      });

      // Final feed: recent manual articles at top, then merged feed
      const finalArticles = [...recentManualArticles, ...mergedArticles];

      setArticles(finalArticles);
      console.log(`Loaded ${finalArticles.length} personalized articles (${recentManualArticles.length} recent manual) with sophisticated ranking`);
      console.log('Top articles:', finalArticles.slice(0, 5).map(a => ({
        title: a.title.substring(0, 50),
        source: a.sourceName,
        language: a.language,
        score: ((a.score?.totalScore || 0) * 100).toFixed(0),
        reasoning: a.reasoning
      })));

    } catch (error) {
      console.error('Error loading personalized articles:', error);
      setArticles([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, preferences]);

  return {
    articles,
    isLoading,
    recordInteraction,
    loadPersonalizedArticles
  };
};
