
/* eslint-disable @typescript-eslint/no-explicit-any */
import { FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send } from "lucide-react";
import { Control, useFormContext } from "react-hook-form";
import { UserPreferences } from "@/types/profile";
import { useState } from "react";
import { useIndustries } from "@/hooks/useIndustries";
import { keywordsByIndustry } from "@/config/preferences";

interface IndustryKeywordSelectProps {
  control: Control<UserPreferences>;
}

export function IndustryKeywordSelect({ control }: IndustryKeywordSelectProps) {
  const [newKeyword, setNewKeyword] = useState("");
  const { industries, loading } = useIndustries();
  const { setValue, getValues } = useFormContext<UserPreferences>();

  const handleAddKeyword = (keyword: string, field: any) => {
    if (!keyword.trim()) return;
    const currentKeywords = Array.isArray(field.value) ? field.value : [];
    if (!currentKeywords.includes(keyword.trim())) {
      field.onChange([...currentKeywords, keyword.trim()]);
    }
    setNewKeyword("");
  };

  const handleRemoveKeyword = (keywordToRemove: string, field: any) => {
    const currentKeywords = Array.isArray(field.value) ? field.value : [];
    field.onChange(currentKeywords.filter((keyword: string) => keyword !== keywordToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: any) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (newKeyword) {
        handleAddKeyword(newKeyword, field);
      }
    }
  };

  const handleIndustryChange = (newIndustries: string[]) => {
    setValue("industries", newIndustries);

    // Auto-compute fixedKeywords from selected industries
    const autoKeywords = Array.from(
      new Set(newIndustries.flatMap(industry =>
        keywordsByIndustry[industry]?.map(pair => pair.real) || []
      ))
    ).sort((a, b) => a.localeCompare(b));

    setValue("fixedKeywords", autoKeywords);

    // Recompute combined keywords
    const preferredKeywords = getValues("preferredKeywords") || [];
    const combined = [...new Set([...autoKeywords, ...preferredKeywords])].sort((a, b) => a.localeCompare(b));
    setValue("keywords", combined);
  };

  return (
    <>
      <FormField
        control={control}
        name="industries"
        render={({ field }) => {
          const safeValue = Array.isArray(field.value) ? field.value : [];
          return (
            <FormItem>
              <FormLabel>Industries</FormLabel>
              <FormControl>
                {loading ? (
                  <div className="h-10 w-full flex items-center justify-center bg-secondary/50 rounded-md">
                    <span className="text-sm text-muted-foreground">Loading industries...</span>
                  </div>
                ) : (
                  <MultiSelect
                    options={industries}
                    selected={safeValue}
                    onChange={(value) => handleIndustryChange(value)}
                    placeholder="Select industries"
                  />
                )}
              </FormControl>
            </FormItem>
          );
        }}
      />

      <FormField
        control={control}
        name="preferredKeywords"
        render={({ field }) => (
          <FormItem className="space-y-4">
            <FormLabel>Topics</FormLabel>
            <FormControl>
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, field)}
                    placeholder="Add a topic..."
                    className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddKeyword(newKeyword, field)}
                    disabled={!newKeyword.trim()}
                    className={`p-2 rounded-full transition-colors ${
                      newKeyword.trim()
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Your topics:</p>
                  <ScrollArea className="h-32 w-full rounded-md border">
                    <div className="flex flex-wrap gap-2 p-4">
                      {Array.isArray(field.value) && field.value.length > 0 ? (
                        field.value.map((keyword: string) => (
                          <Badge
                            key={keyword}
                            variant="default"
                            className="flex items-center"
                          >
                            {keyword}
                            <button
                              type="button"
                              onClick={() => handleRemoveKeyword(keyword, field)}
                              className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </button>
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No topics added</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}
