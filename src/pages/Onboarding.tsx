import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type ChallengePreferences = {
  challengeMode?: boolean;
  preferredTopics?: string[];
  contentTone?: string;
  postingFrequency?: string;
  targetAudience?: string;
  industry?: string;
};

const defaultPrefs = {
  preferredTopics: "AI marketing, founder storytelling",
  contentTone: "Practical",
  postingFrequency: "3 posts/week",
  targetAudience: "Small business leaders",
  industry: "Marketing",
};

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [existingDisplayName, setExistingDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const loadPrefs = async () => {
      if (!user?.id) return;
      const { data } = await supabase.from("profiles").select("preferences, display_name").eq("id", user.id).maybeSingle();
      if (data?.display_name) setExistingDisplayName(data.display_name);
      const existing = data?.preferences as ChallengePreferences | null;
      if (existing?.challengeMode) {
        setPrefs({
          preferredTopics: (existing.preferredTopics || []).join(", "),
          contentTone: existing.contentTone || defaultPrefs.contentTone,
          postingFrequency: existing.postingFrequency || defaultPrefs.postingFrequency,
          targetAudience: existing.targetAudience || defaultPrefs.targetAudience,
          industry: existing.industry || defaultPrefs.industry,
        });
      }
    };
    loadPrefs();
  }, [user?.id]);

  const savePreferences = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;
    setSaving(true);

    const preferredTopics = prefs.preferredTopics
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean);

    const preferences = {
      challengeMode: true,
      preferredTopics,
      contentTone: prefs.contentTone,
      postingFrequency: prefs.postingFrequency,
      targetAudience: prefs.targetAudience,
      industry: prefs.industry,
      region: ["Global"],
      preferredLanguage: "English",
      secondLanguage: "None",
      industries: [prefs.industry],
      keywords: preferredTopics,
      fixedKeywords: [],
      preferredKeywords: preferredTopics,
      trustedMedia: [],
      trustedSourceIds: [],
    };

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          display_name: existingDisplayName || user.email?.split("@")[0] || "Demo User",
          preferences,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      toast({ title: "Preferences saved", description: "Your demo profile is ready." });
      navigate("/dashboard");
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Could not save preferences",
        description: err instanceof Error ? err.message : "Try again after checking your local Supabase setup.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 p-4 flex items-center justify-center">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Set up your content profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePreferences} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="topics">Preferred topics</Label>
              <Input
                id="topics"
                value={prefs.preferredTopics}
                onChange={(e) => setPrefs((prev) => ({ ...prev, preferredTopics: e.target.value }))}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Content tone</Label>
                <Select value={prefs.contentTone} onValueChange={(contentTone) => setPrefs((prev) => ({ ...prev, contentTone }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Practical">Practical</SelectItem>
                    <SelectItem value="Opinionated">Opinionated</SelectItem>
                    <SelectItem value="Warm">Warm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Posting frequency</Label>
                <Select value={prefs.postingFrequency} onValueChange={(postingFrequency) => setPrefs((prev) => ({ ...prev, postingFrequency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1 post/week">1 post/week</SelectItem>
                    <SelectItem value="3 posts/week">3 posts/week</SelectItem>
                    <SelectItem value="5 posts/week">5 posts/week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audience">Target audience</Label>
              <Input
                id="audience"
                value={prefs.targetAudience}
                onChange={(e) => setPrefs((prev) => ({ ...prev, targetAudience: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={prefs.industry}
                onChange={(e) => setPrefs((prev) => ({ ...prev, industry: e.target.value }))}
              />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save preferences"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
