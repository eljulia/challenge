/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Article } from '@/components/ArticleCard';

type Post = {
  id: string;
  content: string;
  article: Article;
  status: "generating" | "revision" | "scheduled" | "published";
  scheduled_for: string | null;
  linkedin_post_url: string | null;
  created_at: string;
  updated_at: string;
  ai_content?: string | null;
  article_id?: string;
  user_id?: string;
};

const fetchPostsForUser = async (userId: string, viaAdmin = false): Promise<Post[]> => {
  let postsData: any[] | null = null;

  if (viaAdmin) {
    // Super-admin impersonation path: RLS blocks reading another user's posts,
    // so route through the SECURITY DEFINER RPC.
    const { data, error } = await supabase.rpc("get_posts_for_admin", { target_user_id: userId });
    if (error) throw error;
    postsData = data as any[];
  } else {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    postsData = data;
  }

  if (!postsData || postsData.length === 0) return [];

  const articleIds = postsData.map((post) => post.article_id);

  const { data: articlesData, error: articlesError } = await supabase
    .from("articles")
    .select("*, sources:sourceid(name)")
    .in("id", articleIds);
  if (articlesError) throw articlesError;

  return postsData
    .map((post) => {
      const article = articlesData.find((a) => a.id === post.article_id);
      if (!article) return null;
      return {
        ...post,
        id: String(post.id),
        scheduled_for:
          post.scheduled_for && post.scheduled_for.trim() !== ""
            ? post.scheduled_for
            : null,
        article: {
          id: article.id,
          title: article.title,
          url: article.url,
          summary: article.summary || "",
          image: article.imageurl || "",
          imageurl: article.imageurl || "",
          source: (article.sources as any)?.name || "Unknown Source",
          publicationdate: article.publicationdate,
        },
      };
    })
    .filter(Boolean) as Post[];
};

export const usePostsQuery = () => {
  const { user } = useAuth();
  const { isImpersonating, impersonatedUser } = useImpersonation();
  const queryClient = useQueryClient();

  const targetUserId = isImpersonating ? impersonatedUser!.id : user?.id;
  const viaAdmin = isImpersonating;

  const query = useQuery({
    queryKey: ['posts', targetUserId],
    queryFn: () => fetchPostsForUser(targetUserId!, viaAdmin),
    enabled: !!targetUserId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as Post[] | undefined;
      const hasGenerating = data?.some((p) => p.status === 'generating');
      return hasGenerating ? 3000 : false;
    },
  });

  const setPosts = (updater: Post[] | ((prev: Post[]) => Post[])) => {
    queryClient.setQueryData(['posts', targetUserId], (old: Post[] | undefined) => {
      if (typeof updater === 'function') {
        return updater(old || []);
      }
      return updater;
    });
  };

  const refetchPosts = () => {
    queryClient.invalidateQueries({ queryKey: ['posts', targetUserId] });
  };

  return {
    posts: query.data || [],
    isLoading: query.isLoading,
    setPosts,
    refetchPosts,
  };
};

export { fetchPostsForUser };
export type { Post };
