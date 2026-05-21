import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarClock, Edit, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type SavedArticle = {
  article_id: string;
  articles: {
    id: string;
    title: string;
    url: string;
    summary: string | null;
    content: string | null;
    imageurl: string;
  } | null;
};

type PostRow = {
  id: string;
  content: string;
  ai_content: string | null;
  article_id: string;
  status: string;
  scheduled_for: string | null;
  articles?: {
    id: string;
    title: string;
    url: string;
    summary: string | null;
    imageurl: string;
  } | null;
};

const GeneratedPosts = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<PostRow | null>(null);
  const [draft, setDraft] = useState("");

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data: saved }, { data: postData, error: postsError }] = await Promise.all([
      supabase
        .from("user_articles")
        .select("article_id, articles:article_id(id, title, url, summary, content, imageurl)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("posts")
        .select("id, content, ai_content, article_id, status, scheduled_for, articles:article_id(id, title, url, summary, imageurl)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (postsError) {
      toast({ variant: "destructive", title: "Could not load posts", description: postsError.message });
    }

    setSavedArticles((saved as any[]) || []);
    setPosts((postData as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const generatedArticleIds = useMemo(() => new Set(posts.map((post) => post.article_id)), [posts]);

  const generatePost = async (articleId: string) => {
    if (!user?.id) return;
    setGeneratingId(articleId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-posts", {
        body: { article_id: articleId, user_id: user.id },
      });
      if (error) throw error;
      if (!data?.post?.id) throw new Error("The fake generator did not return a post.");
      toast({ title: "Post generated", description: "The fake Edge Function saved a draft post." });
      await loadData();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Generation failed", description: err.message || "Unable to generate post." });
    } finally {
      setGeneratingId(null);
    }
  };

  const openEdit = (post: PostRow) => {
    setEditingPost(post);
    setDraft(post.content);
  };

  const saveEdit = async () => {
    if (!editingPost) return;
    await supabase.from("posts").update({ content: draft }).eq("id", editingPost.id);
    setEditingPost(null);
    const { data } = await supabase.from("posts").select("id, content, ai_content, article_id, status, scheduled_for, articles:article_id(id, title, url, summary, imageurl)").eq("user_id", user!.id).order("created_at", { ascending: false });
    if (data) setPosts(data as any[]);
    toast({ title: "Changes saved", description: "Your edit has been saved." });
  };

  const schedulePost = async (post: PostRow) => {
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("posts")
      .update({ status: "scheduled", scheduled_for: scheduledFor, updated_at: new Date().toISOString() })
      .eq("id", post.id);

    if (error) {
      toast({ variant: "destructive", title: "Schedule failed", description: error.message });
      return;
    }

    toast({ title: "Post scheduled", description: "This is a fake local schedule only." });
    loadData();
  };

  const drafts = posts.filter((post) => post.status === "revision");
  const scheduled = posts.filter((post) => post.status === "scheduled");

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/topics")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Generated Posts</h1>
          <p className="text-sm text-muted-foreground">Fake generation, editing, and scheduling.</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading saved articles and posts...</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Saved articles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {savedArticles.length === 0 && <p className="text-sm text-muted-foreground">Save articles from Search Topics first.</p>}
              {savedArticles.map((row) => {
                const article = row.articles;
                if (!article) return null;
                const alreadyGenerated = generatedArticleIds.has(article.id);
                return (
                  <div key={article.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-medium">{article.title}</h2>
                      {alreadyGenerated && <Badge variant="secondary">Generated</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{article.summary}</p>
                    <Button size="sm" onClick={() => generatePost(article.id)} disabled={alreadyGenerated || generatingId === article.id}>
                      {generatingId === article.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                      Generate post
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Draft posts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {drafts.length === 0 && <p className="text-sm text-muted-foreground">No draft posts yet.</p>}
                {drafts.map((post) => (
                  <div key={post.id} className="border rounded-md p-3 space-y-3">
                    <h2 className="font-medium">{post.articles?.title}</h2>
                    <p className="text-sm whitespace-pre-line">{post.content}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(post)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button size="sm" onClick={() => schedulePost(post)}>
                        <CalendarClock className="h-4 w-4 mr-2" />
                        Schedule
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scheduled preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {scheduled.length === 0 && <p className="text-sm text-muted-foreground">No scheduled posts yet.</p>}
                {scheduled.map((post) => {
                  const imageUrl = (post.articles as any)?.imageurl;
                  return (
                    <div key={post.id} className="border rounded-md overflow-hidden">
                      {imageUrl ? (
                        <a href={post.articles?.url || "#"} target="_blank" rel="noreferrer">
                          <img src={imageUrl} alt={post.articles?.title || "Article"} className="w-full h-40 object-cover" />
                        </a>
                      ) : (
                        <div className="h-40 bg-muted flex items-center justify-center text-sm text-muted-foreground">
                          Scheduled image unavailable
                        </div>
                      )}
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="font-medium">{post.articles?.title}</h2>
                          <a href={post.articles?.url || "#"} target="_blank" rel="noreferrer" className="text-primary">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        <p className="text-sm whitespace-pre-line">{post.content}</p>
                        <p className="text-xs text-muted-foreground">
                          Scheduled for {post.scheduled_for ? new Date(post.scheduled_for).toLocaleString() : "not set"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit post</DialogTitle>
          </DialogHeader>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-40" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPost(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GeneratedPosts;
