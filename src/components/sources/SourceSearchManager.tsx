/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Search, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SourceSuggestion {
  name: string;
  url: string;
  description: string;
  alreadyExists?: boolean;
  isTrustedBySES?: boolean;
}

interface SourceSearchManagerProps {
  selectedSources: string[];
  onSourcesChange: (sources: string[]) => void;
  maxSources?: number;
  location?: string[];
  industries?: string[];
  preferredLanguage?: string;
  disabled?: boolean;
}

const SourceSearchManager: React.FC<SourceSearchManagerProps> = ({
  selectedSources,
  onSourcesChange,
  maxSources = 5,
  location = [],
  industries = [],
  preferredLanguage,
  disabled = false,
}) => {
  const [searchInput, setSearchInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (loadMore = false) => {
    const trimmed = searchInput.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchError("Please enter at least 2 characters");
      return;
    }
    if (selectedSources.length >= maxSources) {
      setSearchError(`Maximum of ${maxSources} sources allowed`);
      return;
    }

    setIsSearching(true);
    setSearchError("");
    if (!loadMore) setSuggestions([]);
    setHasSearched(true);

    const excludeNames = [
      ...suggestions.map((s) => s.name),
      ...selectedSources,
    ];

    try {
      const { data, error } = await supabase.functions.invoke("scan-source", {
        body: { query: trimmed, location, exclude: loadMore ? excludeNames : [] },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Search failed");

      const newSources: SourceSuggestion[] = data.sources || [];

      if (loadMore) {
        setSuggestions((prev) => {
          const existingUrls = new Set(prev.map((s) => s.url.replace(/\/$/, "")));
          const unique = newSources.filter((s) => !existingUrls.has(s.url.replace(/\/$/, "")));
          return [...prev, ...unique];
        });
      } else {
        setSuggestions(newSources);
      }

      if (newSources.length === 0) {
        setSearchError(loadMore ? "No additional sources found." : "No sources found. Try a different name.");
      }
    } catch (err: any) {
      console.error("Source search error:", err);
      setSearchError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSource = (source: SourceSuggestion) => {
    if (selectedSources.length >= maxSources) {
      setSearchError(`Maximum of ${maxSources} sources allowed`);
      return;
    }
    const normalizedUrl = source.url.replace(/\/$/, "");
    if (selectedSources.includes(normalizedUrl)) {
      setSearchError("This source has already been added");
      return;
    }
    onSourcesChange([...selectedSources, normalizedUrl]);
    setSuggestions([]);
    setSearchInput("");
    setHasSearched(false);
    setSearchError("");

    // Fire-and-forget: register and trigger inspect + extract pipeline
    supabase.functions.invoke("add-trusted-sources", {
      body: {
        sources: [normalizedUrl],
        sourceType: "preference",
        userPreferences: { region: location, preferredLanguage, industries },
      },
    }).catch((err) => console.error("Failed to register source:", err));
  };

  const handleRemoveSource = (source: string) => {
    onSourcesChange(selectedSources.filter((s) => s !== source));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Type the name of a news source (e.g., "TechCrunch", "BBC"). Max {maxSources} sources.
        </p>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder='e.g. "TechCrunch", "Reuters", "El País"'
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setSearchError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
            disabled={isSearching || disabled}
            className={searchError ? "border-destructive" : ""}
          />
          <Button
            type="button"
            onClick={() => handleSearch()}
            disabled={isSearching || !searchInput.trim() || disabled}
            size="icon"
            className="shrink-0"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {searchError && <p className="text-xs text-destructive">{searchError}</p>}
      </div>

      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Select the correct source:</p>
          {suggestions.map((source, index) => {
            const isAlreadyAdded = source.alreadyExists || selectedSources.includes(source.url.replace(/\/$/, ""));
            const isTrusted = source.isTrustedBySES;
            return (
              <div
                key={index}
                className={`flex items-center justify-between gap-2 rounded-lg border border-border/60 p-3 transition-colors ${
                  isAlreadyAdded || isTrusted ? "bg-muted/50 opacity-60" : "bg-muted/30 hover:bg-muted/60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{source.name}</p>
                    {isTrusted && (
                      <Badge variant="outline" className="text-[10px] shrink-0 border-primary/40 text-primary">Already trusted</Badge>
                    )}
                    {isAlreadyAdded && !isTrusted && (
                      <Badge variant="outline" className="text-[10px] shrink-0">Already added</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{source.description}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Verify source"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant={isAlreadyAdded || isTrusted ? "outline" : "default"}
                    onClick={() => handleSelectSource(source)}
                    disabled={isAlreadyAdded || isTrusted}
                    className="h-8 text-xs"
                  >
                    {isTrusted ? "Trusted" : isAlreadyAdded ? "Added" : "Select"}
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleSearch(true)}
            disabled={isSearching}
            className="w-full text-xs gap-1.5"
          >
            {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Search again for more options
          </Button>
        </div>
      )}

      {/* Selected sources */}
      {selectedSources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSources.map((source, index) => {
            let label = source;
            try { label = new URL(source).hostname.replace(/^www\./, ""); } catch { /* url parse failed; use raw source */ }
            return (
              <Badge key={index} variant="secondary" className="gap-1 pr-1.5">
                {label}
                {!disabled && (
                  <button type="button" onClick={() => handleRemoveSource(source)} className="ml-0.5 hover:text-foreground/70">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SourceSearchManager;
