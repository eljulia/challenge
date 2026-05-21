
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { Trophy, Award, Medal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RankingUser {
  id: string;
  display_name: string;
  current_month_points: number;
  avatar_url?: string;
}

export function UserRanking() {
  const [users, setUsers] = useState<RankingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTopUsers = async () => {
      setLoading(true);
      try {
        // 1) get current user (so you can highlight them)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setCurrentUserId(user.id);
  
        // Use SECURITY DEFINER RPC that bypasses per-row RLS and returns
        // the leaderboard for the current month for all users.
        const { data: leaderboardData, error: leaderboardError } = await supabase
          .rpc('get_leaderboard', { top_n: 7 });

        if (leaderboardError) {
          console.error('Leaderboard RPC error:', leaderboardError);
          throw new Error(leaderboardError.message || 'Unable to load user rankings');
        }

        const rankingUsers: RankingUser[] = (leaderboardData || [])
          .map((r: any) => ({
            id: r.profile_id,
            display_name: r.display_name || 'Anonymous',
            current_month_points: r.points || 0,
            avatar_url: r.avatar_url ?? undefined,
          }))
          .sort((a, b) => b.current_month_points - a.current_month_points);

        setUsers(rankingUsers);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load user rankings');
        toast({
          variant: 'destructive',
          title:   'Error fetching rankings',
          description: err.message,
        });
      } finally {
        setLoading(false);
      }
    };
  
    fetchTopUsers();
  }, [toast]);


  // Helper function to determine medal color
  const getMedalColor = (index: number) => {
    switch(index) {
      case 0: return "text-amber-500"; // Gold
      case 1: return "text-gray-400";  // Silver
      case 2: return "text-amber-700"; // Bronze
      default: return "text-gray-300"; // Other positions
    }
  };

  // Show loading state
  if (loading) {
    return (
      <Card className="mb-6 border-light-grey dark:border-dark-grey">
        <CardContent className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-cyan-blue dark:text-purple" />
              Goal Completion
            </h2>
          </div>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-light-grey/30 dark:bg-dark-grey/30 animate-pulse"></div>
                  <div className="w-24 h-4 bg-light-grey/30 dark:bg-dark-grey/30 animate-pulse"></div>
                </div>
                <div className="w-12 h-4 bg-light-grey/30 dark:bg-dark-grey/30 animate-pulse"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (error) {
    return (
      <Card className="mb-6 border-light-grey dark:border-dark-grey">
        <CardContent className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-cyan-blue dark:text-purple" />
              Goal Completion
            </h2>
          </div>
          <p className="text-sm text-magenta dark:text-magenta">{error}</p>
        </CardContent>
      </Card>
    );
  }

  // Show empty state
  if (users.length === 0) {
    return (
      <Card className="mb-6 border-light-grey dark:border-dark-grey">
        <CardContent className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-cyan-blue dark:text-purple" />
              Goal Completion
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">No user rankings available yet. Start completing goals to see your name here!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-light-grey dark:border-dark-grey">
      <CardContent className="p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-cyan-blue dark:text-purple" />
            Goal Completion
          </h2>
        </div>
        
        <div className="space-y-3">
          {users.map((user, index) => (
            <div 
              key={user.id} 
              className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                currentUserId === user.id 
                  ? 'bg-cyan-blue/5 dark:bg-purple/10' 
                  : 'hover:bg-light-grey/10 dark:hover:bg-dark-grey/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  {index < 3 && (
                    <Medal className={`absolute -top-1 -right-1 h-4 w-4 ${getMedalColor(index)}`} />
                  )}
                  <Avatar className={`h-8 w-8 border ${
                    currentUserId === user.id 
                      ? 'border-cyan-blue dark:border-purple' 
                      : 'border-light-grey dark:border-dark-grey'
                  }`}>
                    <AvatarImage src={user.avatar_url} alt={user.display_name} />
                    <AvatarFallback className={
                      index === 0 
                        ? 'bg-amber-50 text-amber-700' 
                        : (currentUserId === user.id 
                          ? 'bg-cyan-blue/10 text-cyan-blue dark:bg-purple/10 dark:text-purple' 
                          : '')
                    }>{user.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </div>
                <span className={`text-sm font-medium ${
                  currentUserId === user.id 
                    ? 'text-cyan-blue dark:text-purple' 
                    : ''
                }`}>
                  {user.display_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${
                  index === 0 
                    ? 'text-amber-500' 
                    : (currentUserId === user.id 
                      ? 'text-cyan-blue dark:text-purple' 
                      : '')
                }`}>
                  {user.current_month_points} pts
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {users.length > 0 && (
          <div className="mt-4 text-xs text-muted-foreground text-right">
            Showing top {users.length} users
          </div>
        )}
      </CardContent>
    </Card>
  );
}
