import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type ProfilePreferences = {
  preferredTopics?: string[];
  keywords?: string[];
  contentTone?: string;
  postingFrequency?: string;
  targetAudience?: string;
  industry?: string;
  industries?: string[];
};

type ProfileRow = {
  display_name: string | null;
  preferences: ProfilePreferences | null;
  current_month_points: number;
};

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, preferences, current_month_points")
        .eq("id", user.id)
        .maybeSingle();
      setProfile(data);
    };
    loadProfile();
  }, [user?.id]);

  const prefs = profile?.preferences || {};

  const handleLogout = async () => {
    await logout(true);
    navigate("/login", { replace: true });
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Display name</span>
            <span className="font-medium">{profile?.display_name || "Demo User"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Points balance</span>
            <span className="font-medium">{profile?.current_month_points ?? 0}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <PreferenceRow label="Topics" value={(prefs.preferredTopics || prefs.keywords || []).join(", ")} />
          <PreferenceRow label="Tone" value={prefs.contentTone} />
          <PreferenceRow label="Posting frequency" value={prefs.postingFrequency} />
          <PreferenceRow label="Audience" value={prefs.targetAudience} />
          <PreferenceRow label="Industry" value={prefs.industry || prefs.industries?.[0]} />
          <Button variant="outline" className="mt-2" onClick={() => navigate("/onboarding")}>
            Edit preferences
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LinkedIn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="secondary">Fake connected</Badge>
          <p className="text-sm text-muted-foreground">
            LinkedIn OAuth is disabled in challenge mode. Scheduling creates local Supabase records only.
          </p>
          <Button variant="outline" disabled>
            <RefreshCw className="h-4 w-4 mr-2" />
            Renew LinkedIn Token - Disabled in challenge mode
          </Button>
        </CardContent>
      </Card>

      <Button variant="destructive" onClick={handleLogout}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign out
      </Button>
    </div>
  );
};

const PreferenceRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="flex justify-between gap-3 border-b last:border-0 py-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{value || "Not set"}</span>
  </div>
);

export default Profile;
