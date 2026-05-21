import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type ProfileRow = {
  id: string;
  display_name: string | null;
  current_month_points: number;
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [leaderboard, setLeaderboard] = useState<ProfileRow[]>([]);
  const [redeemAmount, setRedeemAmount] = useState(25);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);

  const loadDashboard = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data: me }, { data: users }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, current_month_points").eq("id", user.id).single(),
      supabase
        .from("profiles")
        .select("id, display_name, current_month_points")
        .order("current_month_points", { ascending: false })
        .limit(5),
    ]);
    setProfile(me || null);
    setLeaderboard(users || []);
    setLoading(false);
  };

  useEffect(() => {
    loadDashboard();
  }, [user?.id]);

  const redeemPoints = async () => {
    if (!profile) return;
    setRedeeming(true);
    try {
      const targetProfileId = profile.id;
      const nextPoints = profile.current_month_points - redeemAmount;

      const { error } = await supabase
        .from("profiles")
        .update({ current_month_points: nextPoints, updated_at: new Date().toISOString() })
        .eq("id", targetProfileId);

      if (error) throw error;

      setProfile({ ...profile, current_month_points: nextPoints });
      toast({ title: "Points redeemed", description: `${redeemAmount} points were redeemed.` });
      loadDashboard();
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Redeem failed",
        description: err instanceof Error ? err.message : "Unable to redeem points.",
      });
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading dashboard...</div>;
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Challenge mode: scoring and product flow demo.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/onboarding")}>
          <Settings className="h-4 w-4 mr-2" />
          Preferences
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your points</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-4xl font-bold">{profile?.current_month_points ?? 0}</div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="redeem">Redeem amount</Label>
              <Input
                id="redeem"
                type="number"
                value={redeemAmount}
                min={1}
                onChange={(e) => setRedeemAmount(Number(e.target.value))}
              />
            </div>
            <Button onClick={redeemPoints} disabled={redeeming}>
              <Gift className="h-4 w-4 mr-2" />
              {redeeming ? "Redeeming..." : "Redeem points"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demo leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {leaderboard.map((row) => (
            <div key={row.id} className="flex items-center justify-between border-b last:border-0 py-2">
              <span>{row.display_name || "Demo User"}</span>
              <span className="font-medium">{row.current_month_points} pts</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={() => navigate("/topics")}>
        <Search className="h-4 w-4 mr-2" />
        Search Topics
      </Button>
    </div>
  );
};

export default Dashboard;
