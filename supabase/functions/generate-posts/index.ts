/* eslint-disable @typescript-eslint/no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { article_id, user_id, tone, preferences } = await req.json();

    if (!article_id || !user_id) {
      return json({ error: "article_id and user_id are required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") || "";

    if (!supabaseUrl || !anonKey) {
      return json({ error: "Supabase function environment is not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user || user.id !== user_id) {
      return json({ error: "Unauthorized request" }, 401);
    }

    const [{ data: article, error: articleError }, { data: profile, error: profileError }] = await Promise.all([
      supabase
        .from("articles")
        .select("id, title, summary, content, url, imageurl")
        .eq("id", article_id)
        .single(),
      supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user_id)
        .single(),
    ]);

    if (articleError || !article) {
      return json({ error: "Article not found" }, 404);
    }
    if (profileError || !profile) {
      return json({ error: "Profile not found" }, 404);
    }

    const savedPreferences = (profile.preferences || {}) as Record<string, any>;
    const requestPreferences = preferences && typeof preferences === "object" ? preferences : {};
    const effectiveTone = tone || requestPreferences.contentTone || savedPreferences.contentTone || "practical";
    const topics = savedPreferences.preferredTopics || savedPreferences.keywords || ["your industry"];
    const topicText = Array.isArray(topics) ? topics[0] : String(topics);
    const sourceText = article.content || article.summary || article.title;
    const excerpt = sourceText.slice(0, 180).trim();

    const content = [
      "Here is a quick thought on this topic:",
      "",
      excerpt,
      "",
      `This is especially relevant for professionals interested in ${topicText}.`,
      `Tone: ${effectiveTone}.`,
      "",
      "What do you think?",
      "",
      "[Fake generation: no paid LLM API was called.]",
    ].join("\n");

    const { data: post, error: insertError } = await supabase
      .from("posts")
      .insert({
        user_id,
        article_id,
        content,
        ai_content: content,
        status: "revision",
      })
      .select("id, content, article_id, status, scheduled_for, created_at")
      .single();

    if (insertError) {
      return json({ error: insertError.message }, 400);
    }

    return json({ post, fake: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected function error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
