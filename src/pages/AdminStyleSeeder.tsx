/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

// Super-admin tool to seed any user's writing-style profile from raw,
// hand-collected samples (LinkedIn About + posts + comments).
// Edge function calls Claude to synthesize style_summary,
// signature_phrases, avoid_phrases, then upserts user_style_profiles.
export default function AdminStyleSeeder() {
  const { isSuperAdmin, isLoading: roleLoading } = useImpersonation();
  const navigate = useNavigate();

  const [users, setUsers] = useState<{ id: string; display_name: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [about, setAbout] = useState("");
  const [postsRaw, setPostsRaw] = useState("");
  const [commentsRaw, setCommentsRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [roleLoading, isSuperAdmin, navigate]);

  // Load all profiles via the super_admin RPC
  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      setUsersLoading(true);
      const { data, error } = await supabase.rpc("get_all_profiles_for_admin");
      if (error) {
        toast.error("Failed to load users");
        console.error(error);
      } else {
        const sorted = (data ?? [])
          .map((u: any) => ({
            id: u.id,
            display_name: u.display_name || "(no name)",
          }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name));
        setUsers(sorted);
      }
      setUsersLoading(false);
    })();
  }, [isSuperAdmin]);

  // Split on blank-line separators. Each block becomes one sample.
  const splitBlocks = (raw: string): string[] =>
    raw
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const handleSeed = async () => {
    if (!userId.trim()) {
      toast.error("Select a user");
      return;
    }
    const posts = splitBlocks(postsRaw);
    const comments = splitBlocks(commentsRaw);

    if (posts.length === 0 && comments.length === 0 && !about.trim()) {
      toast.error("Provide at least an About, a post, or a comment");
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("seed-style-from-raw", {
        body: { user_id: userId.trim(), about: about.trim(), posts, comments },
      });
      if (error) throw new Error(error.message);
      setResult(data);
      toast.success("Style profile generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to seed style profile");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <h1 className="text-2xl font-bold">Seed Writing-Style Profile</h1>
      <p className="text-sm text-muted-foreground">
        Pick a user, then paste their real LinkedIn About, posts, and comments.
        Each post or comment must be separated by a blank line. Claude will
        synthesize a voice summary, signature phrases, and clichés to avoid,
        then upsert into <code className="text-xs">user_style_profiles</code>.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="user-select">User</Label>
            <Select value={userId} onValueChange={setUserId} disabled={usersLoading}>
              <SelectTrigger id="user-select">
                <SelectValue
                  placeholder={usersLoading ? "Loading users…" : "Select a user"}
                />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="about">About (LinkedIn bio)</Label>
            <Textarea
              id="about"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              rows={5}
            />
          </div>
          <div>
            <Label htmlFor="posts">Posts (separate each post with a blank line)</Label>
            <Textarea
              id="posts"
              value={postsRaw}
              onChange={(e) => setPostsRaw(e.target.value)}
              rows={8}
            />
          </div>
          <div>
            <Label htmlFor="comments">Comments (separate each with a blank line)</Label>
            <Textarea
              id="comments"
              value={commentsRaw}
              onChange={(e) => setCommentsRaw(e.target.value)}
              rows={10}
            />
          </div>
          <Button onClick={handleSeed} disabled={submitting} className="w-full">
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate & save style profile
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Layer 1 — Identity snapshot</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {result.identity_snapshot
                ? Object.entries(result.identity_snapshot).map(([k, v]) => (
                    <div key={k}>
                      <strong className="capitalize">{k.replace(/_/g, " ")}:</strong>{" "}
                      {Array.isArray(v) ? v.join(", ") : String(v || "—")}
                    </div>
                  ))
                : <span className="text-muted-foreground">No identity captured.</span>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Layer 2 — Voice profile{" "}
                <span className="text-xs text-muted-foreground">
                  (confidence: {result.voice_profile?.confidence || "—"})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {result.voice_profile
                ? Object.entries(result.voice_profile).map(([k, v]) => (
                    <div key={k}>
                      <strong className="capitalize">{k.replace(/_/g, " ")}:</strong>{" "}
                      {Array.isArray(v) ? v.join(", ") : String(v || "—")}
                    </div>
                  ))
                : <span className="text-muted-foreground">No voice profile.</span>}
              <div className="pt-2">
                <strong>Signature phrases:</strong>
                <ul className="list-disc pl-5">
                  {(result.signature_phrases ?? []).map((p: string, i: number) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Avoid phrases:</strong>
                <ul className="list-disc pl-5">
                  {(result.avoid_phrases ?? []).map((p: string, i: number) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Layer 3 — Learning loop</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div><strong>Edit count:</strong> {result.learning_loop?.edit_count ?? 0}</div>
              <div><strong>Samples stored:</strong> {result.samples_count}</div>
              <div className="pt-1 text-muted-foreground">
                Inferred rules and rejected signals fill in as the user edits AI drafts in-app.
              </div>
            </CardContent>
          </Card>

          {result.style_summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Back-compat summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="whitespace-pre-wrap">{result.style_summary}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
