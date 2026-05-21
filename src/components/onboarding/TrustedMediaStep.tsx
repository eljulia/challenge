/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Newspaper } from "lucide-react";
import SourceSearchManager from "@/components/sources/SourceSearchManager";

const CONSENT_VERSION = "2025-05-07";

interface ConsentRecord {
  type: "content_ownership" | "data_processing";
  version: string;
  acceptedAt: string;
}

interface TrustedMediaStepProps {
  formData: {
    industries: string[];
    location: string[];
    preferredLanguage: string;
    secondLanguage: string;
    selectedMedia: string[];
    contentOwnershipConsent?: boolean;
    dataProcessingConsent?: boolean;
    consents: ConsentRecord[];
  };
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
  onTermsNavigation: () => void;
}

const TrustedMediaStep: React.FC<TrustedMediaStepProps> = ({ formData, onChange, errors, onTermsNavigation }) => {
  const [showTrustedSources, setShowTrustedSources] = useState(
    () => (formData.selectedMedia || []).length > 0
  );

  useEffect(() => {
    if (!formData.selectedMedia) {
      onChange("selectedMedia", []);
    }
  }, [formData.selectedMedia, onChange]);

  const handleToggleTrustedSources = (checked: boolean) => {
    setShowTrustedSources(checked);
    if (!checked) {
      onChange("selectedMedia", []);
    }
  };

  useEffect(() => {
    const newConsents: ConsentRecord[] = [];
    if (formData.contentOwnershipConsent) {
      newConsents.push({ type: "content_ownership", version: CONSENT_VERSION, acceptedAt: new Date().toISOString() });
    }
    if (formData.dataProcessingConsent) {
      newConsents.push({ type: "data_processing", version: CONSENT_VERSION, acceptedAt: new Date().toISOString() });
    }
    onChange("consents", newConsents);
  }, [formData.contentOwnershipConsent, formData.dataProcessingConsent, onChange]);

  return (
    <div className="space-y-5">
      {/* Preferred Media Sources - Optional with toggle */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-semibold">
                Preferred Media Sources{' '}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Search and add media sources you'd like to get news from.
              </p>
            </div>
          </div>
          <Switch checked={showTrustedSources} onCheckedChange={handleToggleTrustedSources} />
        </div>

        {showTrustedSources && (
          <div className="pl-6">
            <SourceSearchManager
              selectedSources={formData.selectedMedia || []}
              onSourcesChange={(sources) => onChange("selectedMedia", sources)}
              maxSources={5}
              location={formData.location}
              industries={formData.industries}
              preferredLanguage={formData.preferredLanguage}
            />
          </div>
        )}
      </div>

      {/* Consent & Disclaimers */}
      <div className="space-y-4 border-t border-border/40 pt-5">
        <h3 className="font-medium">Consent & Disclaimers</h3>

        <div className="flex items-start space-x-2">
          <Checkbox
            id="contentOwnershipConsent"
            checked={formData.contentOwnershipConsent || false}
            onCheckedChange={(checked) => onChange("contentOwnershipConsent", checked === true)}
          />
          <div>
            <label htmlFor="contentOwnershipConsent" className="text-sm font-medium leading-none cursor-pointer">
              Content Ownership Disclaimer
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              I confirm that all content is my own and does not represent SES and that I will abide by the{" "}
              <a href="https://www.ses.com/sites/default/files/2021-11/SES-Summary-Code-of-Conduct_Oct_2020.pdf" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                SES Code of Conduct
              </a>.
            </p>
            {errors.contentOwnershipConsent && <p className="text-xs text-destructive mt-1">{errors.contentOwnershipConsent}</p>}
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <Checkbox
            id="dataProcessingConsent"
            checked={formData.dataProcessingConsent || false}
            onCheckedChange={(checked) => onChange("dataProcessingConsent", checked === true)}
          />
          <div>
            <label htmlFor="dataProcessingConsent" className="text-sm font-medium leading-none cursor-pointer">
              Data Processing Consent
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              I consent to the processing of my personal data as described in the{" "}
              <button type="button" onClick={onTermsNavigation} className="text-primary hover:underline bg-none border-none p-0 font-inherit cursor-pointer">
                Terms of Service
              </button>.
            </p>
            {errors.dataProcessingConsent && <p className="text-xs text-destructive mt-1">{errors.dataProcessingConsent}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrustedMediaStep;
