/* eslint-disable @typescript-eslint/no-explicit-any */
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isValid, differenceInHours } from 'date-fns';

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
  isManuallyAdded?: boolean;
  manuallyAddedAt?: string;
}

const isStringArray = (value: any): value is string[] => {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
};

const toStringArray = (value: any): string[] => {
  if (isStringArray(value)) return value;
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
  return [];
};

const ITEMS_PER_PAGE = 10;
const MANUAL_SOURCE_ID = "9820c8db-b489-45ed-8f6d-53306a9aeb10";

// Fetch user's manually added articles
const fetchUserArticles = async (userId: string): Promise<Article[]> => {
  const { data, error } = await supabase
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
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((ua: any) => ({
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
};

// Fetch general articles with pagination
const fetchGeneralArticlesPaginated = async (
  pageParam: number, 
  userId?: string
): Promise<{ articles: Article[]; nextPage: number | null }> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() + 30);
  
  const offset = pageParam * ITEMS_PER_PAGE;
  
  const query = supabase
    .from('articles')
    .select('*, sources(name, language, industries, locations, type)')
    .neq('sourceid', MANUAL_SOURCE_ID)
    .gte('retrievedat', thirtyDaysAgo.toISOString())
    .order('publicationdate', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data, error } = await query;
  if (error) throw error;

  let articles = data?.map(article => ({
    ...article,
    sourceName: article.sources?.name || 'Unknown Source',
    sourceType: article.sources?.type || 'unknown',
    language: article.article_language,
    industries: toStringArray(article.sources?.industries || article.industries),
    locations: toStringArray(article.sources?.locations || article.locations),
    keywords: toStringArray(article.keywords),
    isManuallyAdded: false,
  })) || [];

  const rawCount = articles.length;

  // Filter out articles with existing posts
  if (userId) {
    const { data: existingPosts } = await supabase
      .from('posts')
      .select('article_id')
      .eq('user_id', userId);
    
    const existingArticleIds = existingPosts?.map(post => post.article_id) || [];
    
    if (existingArticleIds.length > 0) {
      articles = articles.filter(article => 
        !existingArticleIds.includes(article.id)
      );
    }
  }

  // Use raw count (before filtering) to determine if more pages exist
  const hasMore = rawCount === ITEMS_PER_PAGE;
  
  return {
    articles,
    nextPage: hasMore ? pageParam + 1 : null,
  };
};

// Fetch articles by types with pagination
const fetchArticlesByTypesPaginated = async (
  sourceTypes: string[],
  pageParam: number,
  userId?: string
): Promise<{ articles: Article[]; nextPage: number | null }> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() + 30);
  
  const offset = pageParam * ITEMS_PER_PAGE;
  
  const query = supabase
    .from('articles')
    .select(`
      *,
      sources!inner(name, language, industries, locations, type)
    `)
    .in('sources.type', sourceTypes)
    .neq('sourceid', MANUAL_SOURCE_ID)
    .gte('retrievedat', thirtyDaysAgo.toISOString())
    .order('publicationdate', { ascending: false })
    .range(offset, offset + ITEMS_PER_PAGE - 1);

  const { data, error } = await query;
  if (error) throw error;

  let articles = data?.map(article => ({
    ...article,
    sourceName: article.sources?.name || 'Unknown Source',
    sourceType: article.sources?.type || 'unknown',
    language: article.article_language,
    industries: toStringArray(article.sources?.industries || article.industries),
    locations: toStringArray(article.sources?.locations || article.locations),
    keywords: toStringArray(article.keywords),
    isManuallyAdded: false,
  })) || [];

  const rawCount = articles.length;

  // Filter out articles with existing posts
  if (userId) {
    const { data: existingPosts } = await supabase
      .from('posts')
      .select('article_id')
      .eq('user_id', userId);
    
    const existingArticleIds = existingPosts?.map(post => post.article_id) || [];
    
    if (existingArticleIds.length > 0) {
      articles = articles.filter(article => 
        !existingArticleIds.includes(article.id)
      );
    }
  }

  // Use raw count (before filtering) to determine if more pages exist
  const hasMore = rawCount === ITEMS_PER_PAGE;
  
  return {
    articles,
    nextPage: hasMore ? pageParam + 1 : null,
  };
};

// Helper to merge and deduplicate articles, prioritizing recent ones
const mergeArticlesWithManual = (userArticles: Article[], generalArticles: Article[]): Article[] => {
  // Check if a sesupload article is within 48h of retrievedat
  const isSesuploadRecent = (article: Article): boolean => {
    if (!article.retrievedat) return false;
    const retrievedDate = parseISO(article.retrievedat);
    if (!isValid(retrievedDate)) return false;
    return differenceInHours(new Date(), retrievedDate) <= 48;
  };

  // Check if a manual article was added by the user within the last 48h
  const isManualRecent = (article: Article): boolean => {
    if (!article.manuallyAddedAt) return false;
    const addedDate = parseISO(article.manuallyAddedAt);
    if (!isValid(addedDate)) return false;
    return differenceInHours(new Date(), addedDate) <= 48;
  };
  
  // Create a map of article IDs to prioritize manual versions
  const articleMap = new Map<string, Article>();
  
  // First add general articles
  generalArticles.forEach(article => {
    articleMap.set(article.id, article);
  });
  
  // Then add/override with manually added articles
  userArticles.forEach(article => {
    articleMap.set(article.id, article);
  });
  
  // Convert back to array
  const mergedArticles = Array.from(articleMap.values());
  
  // Recent manual articles: pinned to top for 48h after the user added them
  const recentManual = mergedArticles.filter(a => 
    a.isManuallyAdded && isManualRecent(a)
  );
  
  // Recent sesupload articles (within 48h of retrievedat, not manual)
  const recentSesupload = mergedArticles.filter(a =>
    !a.isManuallyAdded && a.sourceType === 'sesupload' && isSesuploadRecent(a)
  );
  
  // All other articles (older manual articles fall back to normal pub date sorting)
  const others = mergedArticles.filter(a => 
    !(a.isManuallyAdded && isManualRecent(a)) &&
    !(a.sourceType === 'sesupload' && isSesuploadRecent(a))
  );
  
  // Sort recent manual by manuallyAddedAt (most recently added first)
  recentManual.sort((a, b) => {
    const dateA = a.manuallyAddedAt && isValid(parseISO(a.manuallyAddedAt)) ? parseISO(a.manuallyAddedAt).getTime() : 0;
    const dateB = b.manuallyAddedAt && isValid(parseISO(b.manuallyAddedAt)) ? parseISO(b.manuallyAddedAt).getTime() : 0;
    return dateB - dateA;
  });
  
  // Sort recent sesupload by retrievedat (most recent first)
  recentSesupload.sort((a, b) => {
    const dateA = a.retrievedat && isValid(parseISO(a.retrievedat)) ? parseISO(a.retrievedat).getTime() : 0;
    const dateB = b.retrievedat && isValid(parseISO(b.retrievedat)) ? parseISO(b.retrievedat).getTime() : 0;
    return dateB - dateA;
  });
  
  // Sort others by publication date
  others.sort((a, b) => {
    const dateA = a.publicationdate && isValid(parseISO(a.publicationdate)) ? parseISO(a.publicationdate).getTime() : 0;
    const dateB = b.publicationdate && isValid(parseISO(b.publicationdate)) ? parseISO(b.publicationdate).getTime() : 0;
    return dateB - dateA;
  });
  
  // Combine: recent manual first, then recent sesupload, then others
  return [...recentManual, ...recentSesupload, ...others];
};

export const useInfiniteGeneralArticles = (userId?: string) => {
  return useInfiniteQuery({
    queryKey: ['articles', 'for-you', 'infinite', userId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) return { articles: [], nextPage: null };
      
      // On first page, fetch both in parallel
      if (pageParam === 0) {
        const [page, userArticles] = await Promise.all([
          fetchGeneralArticlesPaginated(pageParam, userId),
          fetchUserArticles(userId)
        ]);
        
        const merged = mergeArticlesWithManual(userArticles, page.articles);
        return {
          articles: merged,
          nextPage: page.nextPage,
        };
      }
      
      // Subsequent pages: just fetch general articles
      return await fetchGeneralArticlesPaginated(pageParam, userId);
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

export const useInfiniteSESArticles = (userId?: string) => {
  return useInfiniteQuery({
    queryKey: ['articles', 'ses', 'infinite', userId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) return { articles: [], nextPage: null };
      
      // On first page, fetch both in parallel
      if (pageParam === 0) {
        const [page, userArticles] = await Promise.all([
          fetchArticlesByTypesPaginated(['ses', 'sesupload'], pageParam, userId),
          fetchUserArticles(userId)
        ]);
        
        const merged = mergeArticlesWithManual(userArticles, page.articles);
        return {
          articles: merged,
          nextPage: page.nextPage,
        };
      }
      
      // Subsequent pages: just fetch SES articles
      return await fetchArticlesByTypesPaginated(['ses', 'sesupload'], pageParam, userId);
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};
