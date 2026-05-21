/* eslint-disable @typescript-eslint/no-explicit-any */
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import useProfileData from './useProfileData';
import { 
  extractKeywords,
  type ArticleScore
} from '@/utils/articleAnalysis';
import { APP_VERSION } from '@/config/version';
import { parseISO, isValid, differenceInHours } from 'date-fns';

interface Article {
  id: string;
  title: string;
  summary: string;  
  imageurl?: string;
  url: string;
  sourceid: string;
  industries?: string[];
  locations?: any;
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

const PAGE_SIZE = 10;

// Simple in-memory cache per user+preferences to avoid re-fetching/scoring on each page.
// Capped to prevent unbounded growth across multiple users / preference changes.
const PERSONALIZED_CACHE_MAX_ENTRIES = 8;
const personalizedCache = new Map<string, Article[]>();
const setPersonalizedCache = (key: string, value: Article[]) => {
  if (personalizedCache.has(key)) personalizedCache.delete(key);
  personalizedCache.set(key, value);
  while (personalizedCache.size > PERSONALIZED_CACHE_MAX_ENTRIES) {
    const oldestKey = personalizedCache.keys().next().value;
    if (oldestKey === undefined) break;
    personalizedCache.delete(oldestKey);
  }
};

const isStringArray = (value: any): value is string[] => {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
};

const buildCacheKey = (userId: string, prefs: any) => {
  try {
    return `${APP_VERSION}:${userId}:${JSON.stringify(prefs || {})}`;
  } catch {
    return `${APP_VERSION}:${userId}:default`;
  }
};

const toStringArray = (value: any): string[] => {
  if (isStringArray(value)) return value;
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
  return [];
};

export const useInfinitePersonalizedArticles = () => {
  const { user } = useAuth();
  const { isImpersonating, effectiveUserId } = useImpersonation();
  const { preferences, isLoaded: prefsLoaded } = useProfileData();

  // Use a stable cache key derived from user+preferences content to prevent
  // re-creating the query on every render (which breaks infinite scroll)
  const stableCacheKey = user?.id && prefsLoaded
    ? buildCacheKey(user.id, preferences)
    : 'no-user-or-prefs';

  return useInfiniteQuery({
    queryKey: ['personalized-articles-infinite', user?.id, effectiveUserId, stableCacheKey],
    queryFn: async ({ pageParam = 0 }) => {
      if (!user?.id || !preferences) {
        console.log('[ForYou] Skipping fetch: missing user or preferences', { hasUser: !!user?.id, hasPrefs: !!preferences });
        return { articles: [], nextPage: undefined };
      }

      // Build cache key and return from cache when available (fast pagination)
      const cacheKey = buildCacheKey(user.id, preferences);

      const slicePage = (all: Article[], p: number) => {
        const startIndex = p * PAGE_SIZE;
        const endIndex = startIndex + PAGE_SIZE;
        return {
          pageArticles: all.slice(startIndex, endIndex),
          nextPage: endIndex < all.length ? p + 1 : undefined as number | undefined,
        };
      };

      const cachedAll = personalizedCache.get(cacheKey);
      if (cachedAll && pageParam > 0) {
        const { pageArticles, nextPage } = slicePage(cachedAll, pageParam);
        return { articles: pageArticles, nextPage };
      }

      // First load: fetch, score, sort once, then cache the full list
      const sinceDate = new Date(Date.now() + 2 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [manualArticlesResult, rawArticlesResult, existingPostsResult] = await Promise.all([
        supabase
          .from('user_articles')
          .select(`
            created_at,
            articles:article_id (
              id, title, summary, imageurl, url, sourceid, industries, locations, article_language, keywords, publicationdate, retrievedat,
              sources!articles_sourceid_fkey (
                name,
                type,
                language,
                industries,
                locations
              )
            )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('articles')
          .select(`
            id, title, summary, imageurl, url, sourceid, industries, locations, article_language, keywords, publicationdate, retrievedat,
            sources!articles_sourceid_fkey (name, language, industries, locations, type)
          `)
          .or(`publicationdate.gte.${sinceDate},retrievedat.gte.${sinceDate}`)
          .order('publicationdate', { ascending: false }),
        // When impersonating, use admin RPC to fetch the impersonator's test posts
        // for the target user (real user posts are hidden from us by RLS).
        isImpersonating
          ? supabase.rpc('get_posts_for_admin', { target_user_id: effectiveUserId! })
              .then(({ data, error }) => ({ data: data?.map((p: any) => ({ article_id: p.article_id })) ?? [], error }))
          : supabase
              .from('posts')
              .select('article_id')
              .eq('user_id', user.id),
      ]);

      const { data: manualArticlesData, error: manualError } = manualArticlesResult;
      const { data: rawArticles, error } = rawArticlesResult;
      const { data: existingPosts } = existingPostsResult as any;

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
        locations: ua.articles?.locations,
        keywords: toStringArray(ua.articles?.keywords),
      })).filter(a => a.id); // Ensure valid articles only

       // Filter out articles with existing posts (but keep manual articles visible)
       const existingArticleIds = existingPosts?.map(post => post.article_id) || [];
       const manualArticleIds = manualArticles.map(a => a.id);
       const baseArticles = rawArticles?.filter(article => 
         !existingArticleIds.includes(article.id) || manualArticleIds.includes(article.id)
       ) || [];
       
      // Build groups independently, then merge per rules
      const userKeywords = preferences?.keywords || [];
      const trustedMedia = preferences?.trustedMedia || [];
      const trustedSourceIds = preferences?.trustedSourceIds || [];
      const userRegions = preferences?.region || [];
      const preferredLanguage = preferences?.preferredLanguage;
      const secondLanguage = preferences?.secondLanguage;

      const langKey = (s?: string) => {
        const keyRaw = (s || '').toLowerCase().trim();
        if (!keyRaw) return '';

        // 1) Prefer ISO 2-letter language code extraction (handles en-US, es-419, pt_BR, etc.)
        const isoMatch = keyRaw.match(/^([a-z]{2})(?:[-_][a-z0-9]+)?/i);
        if (isoMatch) return isoMatch[1].toLowerCase();

        // 2) Fallback normalization for names ("english", "espanol", etc.)
        const key = keyRaw
          .normalize('NFD').replace(/\p{Diacritic}/gu, '')
          .replace(/\([^)]*\)/g, '')
          .replace(/[^a-z]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const map: Record<string, string> = {
          english: 'en', en: 'en', eng: 'en',
          spanish: 'es', es: 'es', spa: 'es', espanol: 'es', espanha: 'es',
          french: 'fr', fr: 'fr', fra: 'fr', francais: 'fr',
          german: 'de', de: 'de', deu: 'de', deutsch: 'de',
          italian: 'it', it: 'it', ita: 'it', italiano: 'it',
          portuguese: 'pt', portugues: 'pt', pt: 'pt', por: 'pt',
          dutch: 'nl', nl: 'nl', nld: 'nl', nederlands: 'nl',
          polish: 'pl', pl: 'pl', pol: 'pl', polski: 'pl',
        };
        if (map[key]) return map[key];

        // 3) Heuristic fallbacks
        if (key.includes('spanish')) return 'es';
        if (key.includes('english')) return 'en';
        if (key.includes('portuguese')) return 'pt';
        if (key.includes('french')) return 'fr';
        if (key.includes('german')) return 'de';
        if (key.includes('italian')) return 'it';
        if (key.includes('dutch')) return 'nl';
        if (key.includes('polish')) return 'pl';
        return keyRaw; // fallback to original raw
      };

      const prefKeys = (() => {
        const pref = (preferredLanguage || '').toLowerCase().trim();
        const second = (secondLanguage || '').toLowerCase().trim();
        const keys: string[] = [];
        if (pref && pref !== 'none') keys.push(langKey(pref));
        if (second && second !== 'none') keys.push(langKey(second));
        return keys;
      })();

      const isLanguageAllowed = (article: any) => {
        if (prefKeys.length === 0) return true;
        const articleLanguage = (article.sources?.language || article.article_language || '');
        const aKey = langKey(articleLanguage);
        return prefKeys.includes(aKey);
      };

      const isRegionAllowed = (article: any) => {
        if (!userRegions || userRegions.length === 0) return true;
        
        const rawLoc = article.sources?.locations ?? article.locations;
        const arr: any[] = Array.isArray(rawLoc)
          ? rawLoc
          : (typeof rawLoc === 'string'
              ? [rawLoc]
              : (rawLoc && typeof rawLoc === 'object'
                  ? Object.values(rawLoc)
                  : []));
        const articleLocations = arr
          .flatMap((v) => typeof v === 'string' ? [v] : (v && typeof v === 'object' ? Object.values(v) : []))
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.toLowerCase());

        // Allow missing locations only for recommended; specificsource requires explicit location match
        if (articleLocations.length === 0) {
          return article.sourceType === 'recommended';
        }

        // Canonicalize regions to handle only LATAM synonyms
        const canonical = (v: string) => {
          const x = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim();
          if (/(^|\b)(latam|latin america|latinoamerica)(\b|$)/.test(x)) return 'latam';
          return x;
        };

        const articleCanon = articleLocations.map(canonical);
        const userCanon = (userRegions as string[]).map(canonical);

        if (articleCanon.includes('global')) return true;

        // Match only if LATAM intent aligns or generic region string overlaps
        const match = articleCanon.some(loc => {
          return userCanon.some(reg => {
            // If user wants LATAM, accept any LATAM synonym on the article
            if (reg === 'latam') {
              return loc === 'latam';
            }
            // Otherwise allow simple overlap
            return loc.includes(reg) || reg.includes(loc);
          });
        });
        return match;
      };

      const hasLanguage = (article: any) => {
        const articleLanguage = (article.sources?.language || article.article_language || '').toString().trim();
        if (!articleLanguage) return false;
        const aKey = langKey(articleLanguage);
        return !!aKey;
      };

      const hasLocation = (article: any) => {
        const rawLoc = article.sources?.locations ?? article.locations;
        const arr: any[] = Array.isArray(rawLoc)
          ? rawLoc
          : (typeof rawLoc === 'string'
              ? [rawLoc]
              : (rawLoc && typeof rawLoc === 'object'
                  ? Object.values(rawLoc)
                  : []));
        const articleLocations = arr
          .flatMap((v) => typeof v === 'string' ? [v] : (v && typeof v === 'object' ? Object.values(v) : []))
          .filter((v): v is string => typeof v === 'string');
        return articleLocations.length > 0;
      };

      const hasKeywordMatch = (article: any) => {
        const articleKeywords = toStringArray(article.keywords || []).map(k => k.toLowerCase());
        const userKs = (userKeywords || []).map((k: string) => k.toLowerCase());
        if (userKs.length === 0) return false;

        // 1) Prefer explicit keyword arrays if present
        if (articleKeywords.length > 0) {
          return articleKeywords.some(keyword =>
            userKs.some(userKeyword =>
              keyword.includes(userKeyword) || userKeyword.includes(keyword)
            )
          );
        }

        // 2) Fallback to title/summary matching when keywords array is missing
        const haystack = `${(article.title || '').toLowerCase()} ${(article.summary || '').toLowerCase()}`;
        return userKs.some(userKeyword => haystack.includes(userKeyword));
      };

      // Strict matching for specificsource articles: must have EXACT combination match
      const hasExactCombinationMatch = (article: any) => {
        // 1. Must have at least one keyword match
        if (!hasKeywordMatch(article)) return false;

        // 2. Must have EXACT language match (not just "allowed")
        const articleLanguage = (article.sources?.language || article.article_language || '').toString().trim();
        const aKey = langKey(articleLanguage);
        if (!aKey || !prefKeys.includes(aKey)) return false;

        // 3. Must have EXACT region match (not fuzzy)
        if (!userRegions || userRegions.length === 0) return false;
        
        const rawLoc = article.sources?.locations ?? article.locations;
        const arr: any[] = Array.isArray(rawLoc)
          ? rawLoc
          : (typeof rawLoc === 'string'
              ? [rawLoc]
              : (rawLoc && typeof rawLoc === 'object'
                  ? Object.values(rawLoc)
                  : []));
        const articleLocations = arr
          .flatMap((v) => typeof v === 'string' ? [v] : (v && typeof v === 'object' ? Object.values(v) : []))
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.toLowerCase());

        if (articleLocations.length === 0) return false;

        const canonical = (v: string) => {
          const x = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim();
          if (/(^|\b)(latam|latin america|latinoamerica)(\b|$)/.test(x)) return 'latam';
          return x;
        };

        const articleCanon = articleLocations.map(canonical);
        const userCanon = (userRegions as string[]).map(canonical);

        // For specificsource, require exact regional match (no fuzzy includes)
        const hasRegionMatch = articleCanon.some(loc => userCanon.includes(loc));

        return hasRegionMatch;
      };
      // Map base articles to include normalized fields we use later
      const mappedArticles = baseArticles.map((article) => {
        const rawType = ((article.sources?.type as string | undefined) || 'general').toLowerCase();
        const normalized = rawType.replace(/\s|-/g, '');
        const group = (() => {
          if (normalized.includes('specific') || normalized === 'ses' || normalized === 'sesupload') return 'specificsource';
          if (normalized.includes('recommended')) return 'recommended';
          if (normalized.includes('selftrusted')) return 'self_trusted';
          // User-added "preference" sources are shared globally and behave like
          // "recommended" — visible to all users, gated only by language/region.
          if (normalized === 'preference' || normalized.includes('preference')) return 'recommended';
          return normalized;
        })();
        return {
          ...article,
          sourceName: (article.sources?.name || 'Unknown Source').trim(),
          sourceType: group,
          language: (article.sources?.language || article.article_language),
          industries: toStringArray(article.sources?.industries || article.industries),
          locations: article.sources?.locations || article.locations,
          keywords: toStringArray(article.keywords || []),
        };
      });

      // Diagnostics: totals before filtering
      const totalRaw = (rawArticles?.length || 0);
      const preSpecific = mappedArticles.filter(a => a.sourceType === 'specificsource');

      // Language and region filters applied to all groups
      const languageAndRegionFiltered = mappedArticles.filter(a => isLanguageAllowed(a) && isRegionAllowed(a));

      // Prepare trusted media set (case-insensitive)
      const trustedSet = new Set((trustedMedia || []).map((s: string) => s.toLowerCase().trim()));
      const trustedSourceIdSet = new Set(trustedSourceIds || []);

      // Filter self_trusted sources by IDs (show only if user has them in preferences)
      const filteredMapped = mappedArticles.filter(a => {
        if (a.sourceType === 'self_trusted') {
          return trustedSourceIdSet.has(a.sourceid);
        }
        return true; // Keep all other types
      });

      // Re-apply language/region filters after source ID filtering
      const finalFiltered = filteredMapped.filter(a => isLanguageAllowed(a) && isRegionAllowed(a));

      // 1) Trusted sources - filter by AI-matched source IDs
      const matchedTrustedSourceIds = new Set(preferences?.matchedTrustedSourceIds || []);
      
      // If no matched sources yet (e.g., right after onboarding), show all trusted articles as fallback
      const trustedArticles = matchedTrustedSourceIds.size > 0
        ? finalFiltered.filter(a => a.sourceType === 'trusted' && matchedTrustedSourceIds.has(a.sourceid))
        : finalFiltered.filter(a => a.sourceType === 'trusted');

      // 2) Self-trusted sources (already filtered by ID above)
      const selfTrustedArticles = finalFiltered.filter(a => a.sourceType === 'self_trusted');

      // 3) Specific source (REQUIRE exact combination match: keyword + language + region)
      const specificSourceArticles = filteredMapped
        .filter(a => a.sourceType === 'specificsource')
        .filter(a => hasExactCombinationMatch(a));

      // 4) Recommended articles (language OR region matched)
      const recommendedArticles = filteredMapped.filter(a =>
        a.sourceType === 'recommended' && (isLanguageAllowed(a) || isRegionAllowed(a))
      );

      // Diagnostics: where specificsource get filtered out
      const specLangFails = preSpecific.filter(a => !isLanguageAllowed(a)).length;
      const specRegionFails = preSpecific.filter(a => isLanguageAllowed(a) && !isRegionAllowed(a)).length;
      const specAfterLangRegion = preSpecific.length - specLangFails - specRegionFails;
      const specKeywordFails = specAfterLangRegion - specificSourceArticles.length;

      console.log('[ForYou] Diagnostics', {
        totalRaw,
        preSpecific: preSpecific.length,
        specLangFails,
        specRegionFails,
        specAfterLangRegion,
        specKeywordFails,
        specificSourceArticles: specificSourceArticles.length,
        trusted: trustedArticles.length,
        selfTrusted: selfTrustedArticles.length,
        recommended_orMatches: recommendedArticles.length,
        prefs: {
          keywords: (preferences?.keywords || []).length,
          regions: (preferences?.region || []).length,
          preferredLanguage: preferences?.preferredLanguage,
          secondLanguage: preferences?.secondLanguage,
          trustedSourceIds: trustedSourceIds.length,
        }
      });

      // Partition recommended by recency (48h) using effective date (retrievedat fallback to publicationdate)
      const now = new Date();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const getEffectiveDate = (a: any): Date | undefined => {
        if (a.retrievedat) return new Date(a.retrievedat);
        if (a.publicationdate) return new Date(a.publicationdate);
        return undefined;
      };

      const recentRecommendedArticles = recommendedArticles.filter(a => {
        const d = getEffectiveDate(a);
        return d ? d > fortyEightHoursAgo : false;
      });

      const oldRecommendedArticles = recommendedArticles.filter(a => {
        const d = getEffectiveDate(a);
        return d ? d <= fortyEightHoursAgo : true;
      });

      // Manual articles partition (48h based on retrievedat)
      const recentManualArticles = manualArticles.filter(a => {
        if (!a.retrievedat) return false;
        const retrievedDate = parseISO(a.retrievedat);
        if (!isValid(retrievedDate)) return false;
        const hoursSinceRetrieved = differenceInHours(now, retrievedDate);
        return hoursSinceRetrieved <= 48;
      });
      const olderManualArticles = manualArticles.filter(a => {
        if (!a.retrievedat) return true; // If no retrievedat, treat as older
        const retrievedDate = parseISO(a.retrievedat);
        if (!isValid(retrievedDate)) return true;
        const hoursSinceRetrieved = differenceInHours(now, retrievedDate);
        return hoursSinceRetrieved > 48;
      });

      // De-duplicate helpers
      const byId = (arr: any[]) => {
        const seen = new Set<string>();
        return arr.filter(a => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
      };

      // Sort helpers
      const dateVal = (a: any) => a.publicationdate ? new Date(a.publicationdate).getTime() : (getEffectiveDate(a)?.getTime() ?? 0);
      const priorityPinnedRest = (a: any) => (a.sourceType === 'specificsource' ? 2 : 1); // specificsource > trusted
      const priorityAll = (a: any) => (a.sourceType === 'specificsource' ? 3 : (a.sourceType === 'recommended' ? 2 : 1));

      // Pin recent recommended at the very top (sorted by publicationdate desc; fallback to effective date)
      const pubDateVal = (a: any) => a.publicationdate ? new Date(a.publicationdate).getTime() : (getEffectiveDate(a)?.getTime() ?? 0);
      const recentRecommendedSorted = [...recentRecommendedArticles].sort((a, b) => pubDateVal(b) - pubDateVal(a));

      console.log('[ForYou] Pinned recommended count', { recent: recentRecommendedSorted.length });

      let allArticles: Article[] = [];

      if (recentRecommendedSorted.length > 0) {
        // Mix all non-recent articles and sort by publicationdate, prioritizing specificsource
        const rest = byId([...specificSourceArticles, ...trustedArticles, ...selfTrustedArticles, ...oldRecommendedArticles, ...olderManualArticles]).sort((a, b) => {
          const dateDiff = dateVal(b) - dateVal(a);
          if (dateDiff !== 0) return dateDiff;
          // Next tiebreaker: keyword match first
          const kwA = hasKeywordMatch(a) ? 1 : 0;
          const kwB = hasKeywordMatch(b) ? 1 : 0;
          if (kwB !== kwA) return kwB - kwA;
          // Final tiebreaker: specificsource > others
          return (b.sourceType === 'specificsource' ? 1 : 0) - (a.sourceType === 'specificsource' ? 1 : 0);
        });

        // Final order: recent manual (top priority) → recent recommended → everything else by date
        allArticles = [...recentManualArticles, ...recentRecommendedSorted, ...rest];
      } else {
        // No recent recommended: manual at top, then everything else sorted by publicationdate, prioritizing specificsource
        const merged = byId([...specificSourceArticles, ...recommendedArticles, ...trustedArticles, ...selfTrustedArticles, ...olderManualArticles]).sort((a, b) => {
          const dateDiff = dateVal(b) - dateVal(a);
          if (dateDiff !== 0) return dateDiff;
          // Next tiebreaker: keyword match first
          const kwA = hasKeywordMatch(a) ? 1 : 0;
          const kwB = hasKeywordMatch(b) ? 1 : 0;
          if (kwB !== kwA) return kwB - kwA;
          // Final tiebreaker: specificsource > others
          return (b.sourceType === 'specificsource' ? 1 : 0) - (a.sourceType === 'specificsource' ? 1 : 0);
        });

        allArticles = [...recentManualArticles, ...merged];
      }



        // Cache the full computed list for fast subsequent pages
        setPersonalizedCache(cacheKey, allArticles);

        const startIndex = pageParam * PAGE_SIZE;
        const endIndex = startIndex + PAGE_SIZE;
        const pageArticles = allArticles.slice(startIndex, endIndex);

        console.log('[ForYou] Pagination', {
          pageParam,
          startIndex,
          endIndex,
          total: allArticles.length,
          returning: pageArticles.length,
          nextPage: endIndex < allArticles.length ? pageParam + 1 : undefined,
        });

        return {
          articles: pageArticles,
          nextPage: endIndex < allArticles.length ? pageParam + 1 : undefined,
        };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: !!user?.id && prefsLoaded,
    staleTime: 2 * 60 * 1000, // 2 minutes - prevent refetching that resets pages
  });
};
