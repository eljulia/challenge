import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type ArticleRow = {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  content: string | null;
  imageurl: string;
  publicationdate: string | null;
  sourceid: string | null;
  sources?: { name?: string | null } | null;
};


const TopicSelection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadArticles = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data: articleData, error: articleError }, { data: savedData }] = await Promise.all([
      supabase
        .from("articles")
        .select("id, title, url, summary, content, imageurl, publicationdate, sourceid, sources:sourceid(name)")
        .order("publicationdate", { ascending: false }),
      supabase.from("user_articles").select("article_id").eq("user_id", user.id),
    ]);

    if (articleError) {
      toast({ variant: "destructive", title: "Could not load articles", description: articleError.message });
    }

    setArticles((articleData as ArticleRow[]) || []);
    setSavedIds(new Set((savedData || []).map((row) => row.article_id)));
    setLoading(false);
  };

  useEffect(() => {
    loadArticles();
  }, [user?.id]);

  const visibleArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((article) =>
      [article.title, article.summary, article.content, article.sources?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [articles, query]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const saveSelected = async () => {
    if (!user?.id || selectedIds.size === 0) return;
    setSaving(true);
    try {
      const rows = Array.from(selectedIds)
        .filter((articleId) => !savedIds.has(articleId))
        .map((articleId) => ({ user_id: user.id, article_id: articleId }));

      if (rows.length > 0) {
        const { error } = await supabase.from("user_articles").insert(rows);
        if (error) throw error;
      }

      setSavedIds((prev) => new Set([...Array.from(prev), ...Array.from(selectedIds)]));
      setSelectedIds(new Set());
      toast({ title: "Articles saved", description: "Saved articles are ready for post generation." });
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Save failed", description: err instanceof Error ? err.message : "Unable to save articles." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Search Topics</h1>
          <p className="text-sm text-muted-foreground">Synthetic demo articles only.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/generated")}>
          <FileText className="h-4 w-4 mr-2" />
          Posts
        </Button>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <Input placeholder="Search articles..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button onClick={saveSelected} disabled={saving || selectedIds.size === 0}>
          <Save className="h-4 w-4 mr-2" />
          Save selected
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading articles...</div>
      ) : (
        <div className="space-y-3">
          {visibleArticles.map((article, index) => {
            const checked = selectedIds.has(article.id);
            const saved = savedIds.has(article.id);
            const displayTitle = article.title;

            return (
              <Card key={article.id} className={checked ? "border-primary" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex gap-3">
                    <Checkbox checked={checked || saved} disabled={saved} onCheckedChange={() => toggleSelected(article.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="font-medium">{displayTitle}</h2>
                          <p className="text-xs text-muted-foreground">{article.sources?.name || "Demo Source"}</p>
                        </div>
                        {saved && <Badge variant="secondary">Saved</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{article.summary}</p>
                    </div>
                  </div>
                  <a className="inline-flex items-center text-sm text-primary hover:underline" href={article.url} target="_blank" rel="noreferrer">
                    Open article
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TopicSelection;
