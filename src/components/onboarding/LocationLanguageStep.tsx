/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MapPin, Globe } from "lucide-react";
import { REGIONS, LANGUAGES } from "@/config/preferences";
import { MultiSelect } from "@/components/ui/multi-select";

interface LocationLanguageStepProps {
  formData: {
    location: string[];
    otherLocation: string;
    preferredLanguage: string;
    otherPreferredLanguage: string;
    secondLanguage: string;
    otherSecondLanguage: string;
  };
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

const LocationLanguageStep: React.FC<LocationLanguageStepProps> = ({
  formData,
  onChange,
  errors
}) => {
  const [showSecondLanguage, setShowSecondLanguage] = useState(
    () => !!formData.secondLanguage && formData.secondLanguage !== "none" && formData.secondLanguage !== "None"
  );

  const handleToggleSecondLanguage = (checked: boolean) => {
    setShowSecondLanguage(checked);
    if (!checked) {
      onChange("secondLanguage", "none");
      onChange("otherSecondLanguage", "");
    }
  };

  // Available languages for preferred (exclude "None")
  const preferredLanguageOptions = LANGUAGES.filter(l => l !== "None");

  // Available languages for second (exclude preferred)
  const secondLanguageOptions = LANGUAGES.filter(
    l => l !== "None" && l !== formData.preferredLanguage
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">
          Tell us about your location and language preferences.
        </p>
      </div>

      {/* Regions */}
      <div className="space-y-2">
        <Label htmlFor="location" className="font-medium">Regions</Label>
        <MultiSelect
          options={REGIONS}
          selected={formData.location || []}
          onChange={(value) => onChange("location", value)}
          placeholder="Select regions"
          className={errors.location ? "border-destructive" : ""}
          leftIcon={<MapPin className="h-4 w-4" />}
        />
        {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
      </div>

      {formData.location.includes("Other") && (
        <div className="space-y-2">
          <Label htmlFor="otherLocation" className="font-medium">Specify Other Region</Label>
          <Input 
            id="otherLocation" 
            type="text" 
            placeholder="Enter your region" 
            value={formData.otherLocation} 
            onChange={e => onChange("otherLocation", e.target.value)} 
            className={errors.otherLocation ? "border-destructive" : ""}
          />
          {errors.otherLocation && <p className="text-xs text-destructive">{errors.otherLocation}</p>}
        </div>
      )}

      {/* Preferred Language */}
      <div className="space-y-2">
        <Label htmlFor="preferredLanguage" className="font-medium">Preferred Language</Label>
        <div className="relative">
          <div className="absolute left-3 top-3 text-muted-foreground z-10">
            <Globe className="h-4 w-4" />
          </div>
          <Select 
            value={formData.preferredLanguage} 
            onValueChange={value => {
              onChange("preferredLanguage", value);
              if (value === formData.secondLanguage) {
                onChange("secondLanguage", "none");
              }
            }}
          >
            <SelectTrigger className={`pl-10 ${errors.preferredLanguage ? "border-destructive" : ""}`}>
              <SelectValue placeholder="Select your preferred language" />
            </SelectTrigger>
            <SelectContent>
              {preferredLanguageOptions.map(language => (
                <SelectItem key={language} value={language}>
                  {language}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {errors.preferredLanguage && <p className="text-xs text-destructive">{errors.preferredLanguage}</p>}
      </div>

      {formData.preferredLanguage === "Other" && (
        <div className="space-y-2">
          <Label htmlFor="otherPreferredLanguage" className="font-medium">Specify Your Preferred Language</Label>
          <Input 
            id="otherPreferredLanguage" 
            type="text" 
            placeholder="Enter your preferred language" 
            value={formData.otherPreferredLanguage} 
            onChange={e => onChange("otherPreferredLanguage", e.target.value)} 
            className={errors.otherPreferredLanguage ? "border-destructive" : ""}
          />
          {errors.otherPreferredLanguage && <p className="text-xs text-destructive">{errors.otherPreferredLanguage}</p>}
        </div>
      )}

      {/* Second Language - Toggle */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              Second Language{' '}
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </h3>
          </div>
          <Switch checked={showSecondLanguage} onCheckedChange={handleToggleSecondLanguage} />
        </div>

        {showSecondLanguage && (
          <div className="pl-6 space-y-2">
            <Select value={formData.secondLanguage === "none" ? undefined : formData.secondLanguage} onValueChange={value => onChange("secondLanguage", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select your second language" />
              </SelectTrigger>
              <SelectContent>
                {secondLanguageOptions.map(language => (
                  <SelectItem key={language} value={language}>
                    {language}
                  </SelectItem>
                ))}
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>

            {formData.secondLanguage === "Other" && (
              <div className="space-y-2">
                <Label htmlFor="otherSecondLanguage" className="font-medium">Specify Your Second Language</Label>
                <Input 
                  id="otherSecondLanguage" 
                  type="text" 
                  placeholder="Enter your second language" 
                  value={formData.otherSecondLanguage} 
                  onChange={e => onChange("otherSecondLanguage", e.target.value)} 
                  className={errors.otherSecondLanguage ? "border-destructive" : ""}
                />
                {errors.otherSecondLanguage && <p className="text-xs text-destructive">{errors.otherSecondLanguage}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationLanguageStep;
