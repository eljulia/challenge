/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Eye, EyeOff, Users } from 'lucide-react';

interface ProfileEntry {
  id: string;
  display_name: string;
  avatar_url: string | null;
  preferences: any;
}

export const ImpersonationSelector = () => {
  const { isSuperAdmin, impersonatedUser, setImpersonatedUser, isImpersonating } = useImpersonation();
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const fetchProfiles = async () => {
      setLoading(true);
      try {
        // Use the security definer function
        const { data, error } = await supabase.rpc('get_all_profiles_for_admin');
        if (error) {
          console.error('Error fetching profiles for impersonation:', error);
          return;
        }
        setProfiles((data as ProfileEntry[]) || []);
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isImpersonating ? 'default' : 'ghost'}
          size="icon"
          className={`rounded-full ${isImpersonating ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'hover:bg-ses-cyan-blue/10 dark:hover:bg-ses-purple/10'}`}
          title={isImpersonating ? `Viewing as ${impersonatedUser?.display_name}` : 'View as user'}
        >
          {isImpersonating ? (
            <Eye className="h-5 w-5" />
          ) : (
            <Users className="h-5 w-5 text-ses-dark-blue dark:text-white" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          View as User
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isImpersonating && (
          <>
            <DropdownMenuItem
              onClick={() => setImpersonatedUser(null)}
              className="text-amber-600 font-medium"
            >
              <EyeOff className="h-4 w-4 mr-2" />
              Stop Impersonating
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {loading ? (
          <div className="p-3 text-sm text-muted-foreground text-center">Loading...</div>
        ) : (
          profiles.map((profile) => (
            <DropdownMenuItem
              key={profile.id}
              onClick={() =>
                setImpersonatedUser({
                  id: profile.id,
                  display_name: profile.display_name || 'Unknown',
                  avatar_url: profile.avatar_url,
                  preferences: profile.preferences,
                })
              }
              className={impersonatedUser?.id === profile.id ? 'bg-accent' : ''}
            >
              <Avatar className="h-6 w-6 mr-2">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {(profile.display_name || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{profile.display_name || 'Unknown'}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
