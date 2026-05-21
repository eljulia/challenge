
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { MultiSelect } from "@/components/ui/multi-select";
import type { Control } from "react-hook-form";
import type { UserPreferences } from "@/types/profile";
import { supabase } from "@/integrations/supabase/client";

interface TrustedMediaSelectProps {
  control: Control<UserPreferences>;
}

interface DbTrustedSource {
  id: string;
  name: string;
  industries: string[] | null;
  locations: string[] | null;
}

export function TrustedMediaSelect({ control }: TrustedMediaSelectProps) {
  const [trustedSources, setTrustedSources] = useState<DbTrustedSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrustedSources = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('sources')
          .select('id, name, industries, locations')
          .eq('type', 'trusted')
          .order('name');

        if (error) throw error;
        
        setTrustedSources(data || []);
      } catch (err: any) {
        console.error('Error fetching trusted sources:', err);
        setError(err.message || 'Failed to load trusted media sources');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrustedSources();
  }, []);
  
  // Get unique source names from trusted sources and sort alphabetically
  const trustedMediaOptions = useMemo(() => {
    if (isLoading) return [];
    return trustedSources.map(source => source.name);
  }, [trustedSources, isLoading]);
  
  return (
    <FormField
      control={control}
      name="trustedMedia"
      render={({ field }) => {
        // Ensure field.value is always an array
        const safeValue = Array.isArray(field.value) ? field.value : [];
        
        return (
          <FormItem>
            <FormLabel>Trusted Media Sources</FormLabel>
            <FormControl>
              {isLoading ? (
                <div className="h-10 bg-gray-100 animate-pulse rounded" />
              ) : error ? (
                <div className="text-red-500 text-sm">{error}</div>
              ) : (
                <MultiSelect
                  options={trustedMediaOptions}
                  selected={safeValue}
                  onChange={(value) => {
                    // Sort the selected values alphabetically
                    const sortedValue = [...value].sort((a, b) => a.localeCompare(b));
                    field.onChange(sortedValue);
                  }}
                  placeholder="Select trusted media sources…"
                />
              )}
            </FormControl>
          </FormItem>
        );
      }}
    />
  );
}
