import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Trash2, Plus } from "lucide-react";
import SourceSearchManager from "@/components/sources/SourceSearchManager";
import { UserPreferences } from "@/types/profile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PreferenceSourcesCardProps {
  preferences: UserPreferences;
  onUpdateSources: (sources: string[]) => void;
}

const MAX_SOURCES = 5;

const PreferenceSourcesCard: React.FC<PreferenceSourcesCardProps> = ({
  preferences,
  onUpdateSources,
}) => {
  const [showSearch, setShowSearch] = useState(false);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);
  const { toast } = useToast();
  // Preference sources must be URLs entered by the user.
  // Filter out any legacy entries that are bare platform source names
  // (BBC, Bloomberg, etc.) to keep this card strictly user-owned.
  const sources = (preferences.trustedMedia || []).filter(
    (s) => typeof s === "string" && (/^https?:\/\//i.test(s) || /\./.test(s))
  );

  const handleSourcesChange = (newSources: string[]) => {
    onUpdateSources(newSources);
    setShowSearch(false);
  };

  const handleConfirmDelete = async () => {
    const source = sourceToDelete;
    if (!source) return;
    setSourceToDelete(null);
    setDeletingSource(source);
    try {
      onUpdateSources(sources.filter((s) => s !== source));

      supabase.functions.invoke("delete-preference-source", {
        body: { sourceUrl: source },
      }).then(({ error }) => {
        if (error) console.error("Failed to delete source from DB:", error);
      });

      toast({ title: "Source removed", description: "The source and its articles have been removed." });
    } finally {
      setDeletingSource(null);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Preference Sources ({sources.length}/{MAX_SOURCES})
          </h3>
          {sources.length < MAX_SOURCES && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSearch(!showSearch)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Source
            </Button>
          )}
        </div>

        {/* Search section */}
        {showSearch && (
          <div className="border rounded-lg p-4 bg-muted/30">
            <SourceSearchManager
              selectedSources={sources}
              onSourcesChange={handleSourcesChange}
              maxSources={MAX_SOURCES}
              location={preferences.region}
              industries={preferences.industries}
              preferredLanguage={preferences.preferredLanguage}
            />
          </div>
        )}

        {/* Current sources list */}
        {sources.length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground mb-2">Current Sources</p>
            {sources.map((source, index) => {
              let hostname = source;
              try {
                hostname = new URL(source).hostname.replace(/^www\./, "");
              } catch { /* url parse failed; use raw source */ }

              return (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <a
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                    </a>
                    <span className="text-sm font-medium truncate">{hostname}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {source}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setSourceToDelete(source)}
                    disabled={deletingSource === source}
                    title="Remove source"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          !showSearch && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sources added yet. Click "Add Source" to get started.
            </p>
          )
        )}
      </CardContent>

      <AlertDialog open={!!sourceToDelete} onOpenChange={(open) => !open && setSourceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop extracting news and articles from this source. All currently extracted articles will be deleted, except those already in editing, published, or scheduled as posts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default PreferenceSourcesCard;
