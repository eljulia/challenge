
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserPreferences } from "@/types/profile";
import { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keywordsByIndustry } from "@/config/preferences";

interface ConsentRecord {
  type: 'content_ownership' | 'data_processing';
  version: string;
  acceptedAt: string;
}

// Helper function to sort array alphabetically
const sortAlphabetically = (arr: string[]): string[] => {
  return [...arr].sort((a, b) => a.localeCompare(b));
};

const getFixedKeywordsForIndustries = (industries: string[]): string[] => {
  return sortAlphabetically(
    Array.from(
      new Set(
        industries.flatMap((industry) =>
          keywordsByIndustry[industry]?.map((pair) => pair.real) || []
        )
      )
    )
  );
};

const defaultPreferences: UserPreferences = {
  region: [],
  preferredLanguage: "None",
  secondLanguage: "None",
  industries: [],
  keywords: [],
  fixedKeywords: [],
  preferredKeywords: [],
  trustedMedia: [],
  trustedSourceIds: [],
};

const useProfileData = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const userId = user?.id;

  // React Query for profile data — cached across navigations
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile-data', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('preferences, consents, current_month_points, your_thoughts, display_name, avatar_url')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      const p = profile?.preferences as any;
      const industries = Array.isArray(p?.industries) ? sortAlphabetically(p.industries) : [];
      const derivedFixedKw = getFixedKeywordsForIndustries(industries);
      const fixedKw = Array.isArray(p?.fixedKeywords) && p.fixedKeywords.length > 0
        ? sortAlphabetically(p.fixedKeywords)
        : derivedFixedKw;
      const preferredKw = Array.isArray(p?.preferredKeywords) ? sortAlphabetically(p.preferredKeywords) : [];
      const allKeywords = Array.isArray(p?.keywords) ? sortAlphabetically(p.keywords) : [];
      const hasNewFormat = Array.isArray(p?.fixedKeywords) || Array.isArray(p?.preferredKeywords);
      const legacyPreferredKw = allKeywords.filter((keyword) => !derivedFixedKw.includes(keyword));
      const combinedKeywords = hasNewFormat
        ? sortAlphabetically([...new Set([...fixedKw, ...preferredKw])])
        : sortAlphabetically([...new Set([...derivedFixedKw, ...legacyPreferredKw])]);

      const preferences: UserPreferences = {
        region: Array.isArray(p?.region) ? sortAlphabetically(p.region) : [],
        preferredLanguage: typeof p?.preferredLanguage === 'string' ? p.preferredLanguage : "None",
        secondLanguage: typeof p?.secondLanguage === 'string' ? p.secondLanguage : "None",
        industries,
        keywords: combinedKeywords,
        fixedKeywords: hasNewFormat ? fixedKw : derivedFixedKw,
        preferredKeywords: hasNewFormat ? preferredKw : legacyPreferredKw,
        trustedMedia: Array.isArray(p?.trustedMedia) ? sortAlphabetically(p.trustedMedia) : [],
        trustedSourceIds: Array.isArray(p?.trustedSourceIds) ? sortAlphabetically(p.trustedSourceIds) : [],
        matchedTrustedSourceIds: Array.isArray(p?.matchedTrustedSourceIds) ? p.matchedTrustedSourceIds : undefined,
      };

      const consents: ConsentRecord[] = profile?.consents && Array.isArray(profile.consents)
        ? (profile.consents as unknown) as ConsentRecord[]
        : [];

      const yourThoughts: any[] | null = profile?.your_thoughts && Array.isArray(profile.your_thoughts)
        ? profile.your_thoughts as any[]
        : null;

      // Build user display data from auth user metadata
      const metadata = user?.user_metadata;
      const userData = {
        name: metadata?.full_name
          || profile?.display_name
          || `${metadata?.firstName || ''} ${metadata?.lastName || ''}`.trim()
          || user?.email?.split('@')[0]
          || 'User',
        email: user?.email || undefined,
        avatar_url: metadata?.avatar_url || metadata?.picture || profile?.avatar_url || undefined,
        points: profile?.current_month_points || 0,
      };

      return { preferences, consents, yourThoughts, userData };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoaded = !isProfileLoading && !!profileData;
  const preferences = profileData?.preferences ?? defaultPreferences;
  const consents = profileData?.consents ?? [];
  const yourThoughts = profileData?.yourThoughts ?? null;

  // Always build userData from auth user even before profile query resolves
  const userData = profileData?.userData ?? {
    name: user?.user_metadata?.full_name
      || `${user?.user_metadata?.firstName || ''} ${user?.user_metadata?.lastName || ''}`.trim()
      || user?.email?.split('@')[0]
      || 'User',
    email: user?.email || undefined,
    avatar_url: user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
    points: 0,
  };

  const setYourThoughts = useCallback((updated: any[] | null) => {
    queryClient.setQueryData(['profile-data', userId], (old: any) => {
      if (!old) return old;
      return { ...old, yourThoughts: updated };
    });
  }, [userId, queryClient]);

  const handlePreferencesUpdate = useCallback(async (newPreferences: UserPreferences) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const industries = sortAlphabetically(newPreferences.industries || []);
      const fixedKw = sortAlphabetically([
        ...new Set([
          ...(newPreferences.fixedKeywords || []),
          ...getFixedKeywordsForIndustries(industries),
        ]),
      ]);
      const preferredKw = sortAlphabetically(
        (newPreferences.preferredKeywords || []).filter((keyword) => !fixedKw.includes(keyword))
      );
      const combinedKeywords = sortAlphabetically([...new Set([...fixedKw, ...preferredKw])]);

      const sortedPreferences: UserPreferences = {
        region: sortAlphabetically(newPreferences.region),
        preferredLanguage: newPreferences.preferredLanguage,
        secondLanguage: newPreferences.secondLanguage,
        industries,
        keywords: combinedKeywords,
        fixedKeywords: fixedKw,
        preferredKeywords: preferredKw,
        trustedMedia: sortAlphabetically(newPreferences.trustedMedia),
        trustedSourceIds: sortAlphabetically(newPreferences.trustedSourceIds || []),
      };

      const jsonPreferences: Record<string, Json> = {
        region: sortedPreferences.region,
        preferredLanguage: sortedPreferences.preferredLanguage,
        secondLanguage: sortedPreferences.secondLanguage,
        industries: sortedPreferences.industries,
        keywords: sortedPreferences.keywords,
        fixedKeywords: sortedPreferences.fixedKeywords,
        preferredKeywords: sortedPreferences.preferredKeywords,
        trustedMedia: sortedPreferences.trustedMedia,
        trustedSourceIds: sortedPreferences.trustedSourceIds,
      };

      const { error } = await supabase
        .from('profiles')
        .update({ preferences: jsonPreferences })
        .eq('id', session.user.id);

      if (error) throw error;

      // Update cache immediately
      queryClient.setQueryData(['profile-data', session.user.id], (old: any) => {
        if (!old) return old;
        return { ...old, preferences: sortedPreferences };
      });

      // Fire-and-forget background tasks
      supabase.functions.invoke('match-trusted-sources', {
        body: { userId: session.user.id, preferences: sortedPreferences }
      }).catch(err => console.error('Failed to re-match trusted sources:', err));

      toast({ title: "Success", description: "Preferences updated successfully" });
    } catch (err) {
      console.error("Error updating preferences:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update preferences",
      });
    }
  }, [toast, queryClient]);

  return { userData, preferences, consents, yourThoughts, setYourThoughts, handlePreferencesUpdate, isLoaded };
};

export default useProfileData;
