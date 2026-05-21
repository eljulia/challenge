/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPostsForUser } from '@/hooks/usePostsQuery';

const sortAlphabetically = (arr: string[]) => [...arr].sort((a, b) => a.localeCompare(b));

/**
 * Silently prefetches article feeds and posts while the user is on the Dashboard,
 * so the Topics and Posts pages load instantly when navigated to.
 */
export function usePrefetchArticles() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;

    // Prefetch SES articles (first page) using the same page shape as useInfiniteSESArticles
    queryClient.prefetchInfiniteQuery({
      queryKey: ['articles', 'ses', 'infinite', userId],
      queryFn: async ({ pageParam = 0 }) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() + 30);
        const offset = pageParam * 10;

        const { data: articlesData, error } = await supabase
          .from('articles')
          .select('*, sources!inner(name, language, industries, locations, type)')
          .in('sources.type', ['ses', 'sesupload'])
          .neq('sourceid', '9820c8db-b489-45ed-8f6d-53306a9aeb10')
          .gte('retrievedat', thirtyDaysAgo.toISOString())
          .order('publicationdate', { ascending: false })
          .range(offset, offset + 9);

        if (error) throw error;

        const articles = articlesData?.map(article => ({
          ...article,
          sourceName: (article.sources as any)?.name || 'Unknown Source',
          sourceType: (article.sources as any)?.type || 'unknown',
          language: article.article_language,
          industries: Array.isArray((article.sources as any)?.industries) ? (article.sources as any).industries : Array.isArray(article.industries) ? article.industries : [],
          locations: Array.isArray((article.sources as any)?.locations) ? (article.sources as any).locations : Array.isArray(article.locations) ? article.locations : [],
          keywords: Array.isArray(article.keywords) ? article.keywords : [],
          isManuallyAdded: false,
        })) || [];

        return {
          articles,
          nextPage: articles.length === 10 ? pageParam + 1 : null,
        };
      },
      initialPageParam: 0,
      staleTime: 5 * 60 * 1000,
    });

    // Prefetch profile/preferences data
    queryClient.prefetchQuery({
      queryKey: ['profile-data', userId],
      queryFn: async () => {
        const { data } = await supabase
          .from('profiles')
          .select('preferences, consents, current_month_points, your_thoughts, display_name, avatar_url')
          .eq('id', userId)
          .single();
        
        if (!data) return null;

        const p = data.preferences as any;
        const fixedKeywords = Array.isArray(p?.fixedKeywords) ? sortAlphabetically(p.fixedKeywords) : [];
        const preferredKeywords = Array.isArray(p?.preferredKeywords)
          ? sortAlphabetically(p.preferredKeywords)
          : Array.isArray(p?.keywords)
            ? sortAlphabetically(p.keywords)
            : [];
        return {
          preferences: {
            region: Array.isArray(p?.region) ? p.region : [],
            preferredLanguage: typeof p?.preferredLanguage === 'string' ? p.preferredLanguage : "None",
            secondLanguage: typeof p?.secondLanguage === 'string' ? p.secondLanguage : "None",
            industries: Array.isArray(p?.industries) ? p.industries : [],
            keywords: Array.isArray(p?.keywords) ? p.keywords : [],
            fixedKeywords,
            preferredKeywords,
            trustedMedia: Array.isArray(p?.trustedMedia) ? p.trustedMedia : [],
            trustedSourceIds: Array.isArray(p?.trustedSourceIds) ? p.trustedSourceIds : [],
          },
          consents: data.consents || [],
          yourThoughts: data.your_thoughts || null,
          userData: {
            name: data.display_name || '',
            avatar_url: data.avatar_url || undefined,
            points: data.current_month_points || 0,
          },
        };
      },
      staleTime: 5 * 60 * 1000,
    });

    // Prefetch posts
    queryClient.prefetchQuery({
      queryKey: ['posts', userId],
      queryFn: () => fetchPostsForUser(userId),
      staleTime: 5 * 60 * 1000,
    });
  }, [user?.id, queryClient]);
}
