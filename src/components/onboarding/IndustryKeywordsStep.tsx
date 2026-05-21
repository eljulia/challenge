
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Check, Send, X, Tag, Building2 } from 'lucide-react';
import { keywordsByIndustry } from '@/config/preferences';
import { INDUSTRIES } from '@/config/preferences';

interface IndustryKeywordsStepProps {
  formData: {
    industries: string[];
    keywords?: string[];
    ECIndustries?: string[];
    customKeywords?: string[];
  };
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

// Main industry keys (the ones shown as toggle buttons)
const MAIN_INDUSTRY_KEYS = Object.keys(keywordsByIndustry);

// Popular additional industries people might search for
const POPULAR_EXTRA_INDUSTRIES = [
  "Aerospace & Defense",
  "Agriculture & Agritech",
  "Automotive",
  "Banking & Finance",
  "Construction",
  "Cybersecurity",
  "E-Commerce",
  "Education & EdTech",
  "Healthcare & MedTech",
  "Hospitality & Tourism",
  "Insurance",
  "Logistics & Supply Chain",
  "Manufacturing",
  "Oil & Gas",
  "Pharmaceuticals",
  "Real Estate & PropTech",
  "Retail",
  "SaaS & Cloud Software",
  "Semiconductors",
  "Smart Cities",
  "Space & Satellites",
  "Transportation",
];

// All known industries for autocomplete
const ALL_KNOWN_INDUSTRIES = Array.from(
  new Set([...MAIN_INDUSTRY_KEYS, ...INDUSTRIES, ...POPULAR_EXTRA_INDUSTRIES])
).sort((a, b) => a.localeCompare(b));

// Popular additional topics/keywords people might search for
const POPULAR_EXTRA_KEYWORDS = [
  "5G deployment",
  "5G standalone",
  "6G research",
  "AI & machine learning",
  "antenna technology",
  "autonomous vehicles",
  "backhaul solutions",
  "bandwidth optimization",
  "blockchain",
  "broadband access",
  "carbon neutrality",
  "cloud computing",
  "cloud native",
  "content delivery",
  "critical infrastructure",
  "cybersecurity",
  "data analytics",
  "data privacy",
  "deep learning",
  "digital inclusion",
  "digital transformation",
  "digital twin",
  "disaster recovery",
  "drone technology",
  "edge computing",
  "electric vehicles",
  "emergency communications",
  "ESG & sustainability",
  "fiber optic",
  "fixed wireless access",
  "fleet management",
  "GEO satellites",
  "GNSS & positioning",
  "green energy",
  "hybrid cloud",
  "IaaS & PaaS",
  "industrial IoT",
  "internet of things",
  "interoperability",
  "latency optimization",
  "LEO satellites",
  "LTE advanced",
  "managed services",
  "MEO satellites",
  "microwave links",
  "mmWave",
  "mobile edge computing",
  "multi-orbit",
  "net neutrality",
  "network automation",
  "network orchestration",
  "network resilience",
  "network security",
  "network slicing",
  "NFV & SDN",
  "NTN (non-terrestrial networks)",
  "O-RAN",
  "optical networking",
  "predictive maintenance",
  "private networks",
  "quantum computing",
  "radio frequency",
  "remote monitoring",
  "remote workforce",
  "renewable energy",
  "roaming",
  "rural broadband",
  "satellite broadband",
  "satellite IoT",
  "SCADA systems",
  "smart city",
  "smart grid",
  "smart metering",
  "spectrum management",
  "supply chain resilience",
  "telemetry",
  "tower infrastructure",
  "undersea cables",
  "unified communications",
  "VSAT",
  "Wi-Fi 6E",
  "Wi-Fi 7",
  "zero trust security",
];

// All known keywords for autocomplete
const ALL_KNOWN_KEYWORDS = Array.from(
  new Set([
    ...Object.values(keywordsByIndustry).flatMap(pairs =>
      pairs.flatMap(p => [p.visible, p.real])
    ),
    ...POPULAR_EXTRA_KEYWORDS,
  ])
).sort((a, b) => a.localeCompare(b));

const IndustryKeywordsStep = ({ formData, onChange, errors }: IndustryKeywordsStepProps) => {
  const [industryInput, setIndustryInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [showOptionalIndustries, setShowOptionalIndustries] = useState(
    () => (formData.ECIndustries?.length ?? 0) > 0
  );
  const [showOptionalKeywords, setShowOptionalKeywords] = useState(
    () => (formData.customKeywords?.length ?? 0) > 0
  );
  const [showIndustrySuggestions, setShowIndustrySuggestions] = useState(false);
  const [showKeywordSuggestions, setShowKeywordSuggestions] = useState(false);

  const selectedIndustries = Array.isArray(formData.industries) ? formData.industries : [];
  const additionalIndustries = Array.isArray(formData.ECIndustries) ? formData.ECIndustries : [];
  const customKeywords = Array.isArray(formData.customKeywords) ? formData.customKeywords : [];

  // Industry suggestions — starts-with first, then contains, then fuzzy closest match
  const industrySuggestions = useMemo(() => {
    if (!industryInput.trim()) return [];
    const lower = industryInput.toLowerCase();
    const allSelected = [...selectedIndustries, ...additionalIndustries];
    const available = ALL_KNOWN_INDUSTRIES.filter(ind => !allSelected.includes(ind));

    const matches = available.filter(ind => ind.toLowerCase().includes(lower));
    matches.sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(lower) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.localeCompare(b);
    });

    // If fewer than 3 substring matches, add fuzzy matches by word overlap
    if (matches.length < 3) {
      const inputWords = lower.split(/\s+/).filter(Boolean);
      const fuzzy = available
        .filter(ind => !matches.includes(ind))
        .map(ind => {
          const indLower = ind.toLowerCase();
          const score = inputWords.reduce((s, w) => s + (indLower.includes(w) ? 2 : (w.length > 2 && indLower.split(/\s+/).some(iw => iw.startsWith(w.slice(0, 3))) ? 1 : 0)), 0);
          return { ind, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || a.ind.localeCompare(b.ind));
      
      const needed = 3 - matches.length;
      matches.push(...fuzzy.slice(0, needed).map(x => x.ind));
    }

    return matches.slice(0, 12);
  }, [industryInput, selectedIndustries, additionalIndustries]);

  // Keyword suggestions — starts-with first, then contains, then fuzzy closest match
  const keywordSuggestions = useMemo(() => {
    if (!keywordInput.trim()) return [];
    const lower = keywordInput.toLowerCase();
    const matches = ALL_KNOWN_KEYWORDS.filter(
      kw => kw.toLowerCase().includes(lower) && !customKeywords.includes(kw)
    );
    matches.sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(lower) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.localeCompare(b);
    });

    // If fewer than 3 substring matches, add fuzzy matches by word overlap
    if (matches.length < 3) {
      const inputWords = lower.split(/\s+/).filter(Boolean);
      const available = ALL_KNOWN_KEYWORDS.filter(kw => !customKeywords.includes(kw) && !matches.includes(kw));
      const fuzzy = available
        .map(kw => {
          const kwLower = kw.toLowerCase();
          const score = inputWords.reduce((s, w) => s + (kwLower.includes(w) ? 2 : (w.length > 2 && kwLower.split(/\s+/).some(kWord => kWord.startsWith(w.slice(0, 3))) ? 1 : 0)), 0);
          return { kw, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || a.kw.localeCompare(b.kw));
      
      const needed = 3 - matches.length;
      matches.push(...fuzzy.slice(0, needed).map(x => x.kw));
    }

    return matches.slice(0, 12);
  }, [keywordInput, customKeywords]);

  const handleSelectIndustry = (industry: string) => {
    const updatedIndustries = selectedIndustries.includes(industry)
      ? selectedIndustries.filter(i => i !== industry)
      : [...selectedIndustries, industry].sort((a, b) => a.localeCompare(b));

    onChange('industries', updatedIndustries);

    // Auto-manage keywords behind the scenes
    const newKeywords = Array.from(
      new Set(updatedIndustries.flatMap(i => keywordsByIndustry[i]?.map(pair => pair.real) || []))
    ).sort((a, b) => a.localeCompare(b));
    onChange('keywords', newKeywords);
  };

  const handleAddAdditionalIndustry = (value?: string) => {
    const industry = (value || industryInput).trim();
    if (!industry) return;

    // If it matches a main industry, toggle it instead of adding as extra
    const mainMatch = MAIN_INDUSTRY_KEYS.find(
      k => k.toLowerCase() === industry.toLowerCase()
    );
    if (mainMatch) {
      if (!selectedIndustries.includes(mainMatch)) {
        handleSelectIndustry(mainMatch);
      }
      setIndustryInput('');
      setShowIndustrySuggestions(false);
      return;
    }

    const allSelected = [...selectedIndustries, ...additionalIndustries];
    if (allSelected.includes(industry)) return;

    const updated = [...additionalIndustries, industry].sort((a, b) => a.localeCompare(b));
    onChange('ECIndustries', updated);
    setIndustryInput('');
    setShowIndustrySuggestions(false);
  };

  const handleRemoveAdditionalIndustry = (industry: string) => {
    onChange('ECIndustries', additionalIndustries.filter(i => i !== industry));
  };

  const handleAddKeyword = (value?: string) => {
    const keyword = (value || keywordInput).trim();
    if (!keyword) return;
    if (customKeywords.includes(keyword)) return;

    const updated = [...customKeywords, keyword].sort((a, b) => a.localeCompare(b));
    onChange('customKeywords', updated);
    setKeywordInput('');
    setShowKeywordSuggestions(false);
  };

  const handleRemoveKeyword = (keyword: string) => {
    onChange('customKeywords', customKeywords.filter(k => k !== keyword));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-5">
        {/* Main Industries */}
        <div>
          <h2 className="text-lg font-semibold mb-1">Select your Industries</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Choose the industries you'd like to receive the latest news and articles from.
          </p>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex flex-wrap gap-2">
              {Object.keys(keywordsByIndustry)
                .sort((a, b) => a.localeCompare(b))
                .map(ind => {
                  const isSelected = selectedIndustries.includes(ind);
                  return (
                    <button
                      key={ind}
                      type="button"
                      onClick={() => handleSelectIndustry(ind)}
                      className={`
                        inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium
                        transition-all duration-150 border
                        ${isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-foreground border-border/60 hover:border-primary/40 hover:bg-accent/50'
                        }
                      `}
                    >
                      {ind}
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Optional: Additional Industries */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold">
                  Additional Industries{' '}
                   <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </h3>
              </div>
            </div>
            <Switch checked={showOptionalIndustries} onCheckedChange={setShowOptionalIndustries} />
          </div>

          {showOptionalIndustries && (
            <div className="space-y-2 pl-6">
              {additionalIndustries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {additionalIndustries.map(ind => (
                    <Badge key={ind} variant="default" className="gap-1 pr-1.5">
                      {ind}
                      <button onClick={() => handleRemoveAdditionalIndustry(ind)} className="ml-0.5 hover:text-primary-foreground/70">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <AutocompleteInput
                value={industryInput}
                onChange={setIndustryInput}
                onSubmit={() => handleAddAdditionalIndustry()}
                onSelectSuggestion={handleAddAdditionalIndustry}
                suggestions={industrySuggestions}
                showSuggestions={showIndustrySuggestions}
                setShowSuggestions={setShowIndustrySuggestions}
                placeholder="Type an industry…"
              />
            </div>
          )}
        </div>

        {/* Optional: Additional Keywords */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold">
                   Topics{' '}
                   <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                 </h3>
                 <p className="text-xs text-muted-foreground">
                   Add topics you're interested in to further personalize your feed.
                 </p>
               </div>
            </div>
            <Switch checked={showOptionalKeywords} onCheckedChange={setShowOptionalKeywords} />
          </div>

          {showOptionalKeywords && (
            <div className="space-y-2 pl-6">
              {customKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {customKeywords.map(kw => (
                    <Badge key={kw} variant="secondary" className="gap-1 pr-1.5">
                      {kw}
                      <button onClick={() => handleRemoveKeyword(kw)} className="ml-0.5 hover:text-foreground/70">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <AutocompleteInput
                value={keywordInput}
                onChange={setKeywordInput}
                onSubmit={() => handleAddKeyword()}
                onSelectSuggestion={handleAddKeyword}
                suggestions={keywordSuggestions}
                showSuggestions={showKeywordSuggestions}
                setShowSuggestions={setShowKeywordSuggestions}
                placeholder="Type a topic…"
              />
            </div>
          )}
        </div>
      </div>

      {errors.industries && <p className="text-xs text-destructive mt-1">{errors.industries}</p>}
    </div>
  );
};

// Reusable autocomplete input component
function AutocompleteInput({
  value,
  onChange,
  onSubmit,
  onSelectSuggestion,
  suggestions,
  showSuggestions,
  setShowSuggestions,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onSelectSuggestion: (v: string) => void;
  suggestions: string[];
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  placeholder: string;
}) {
  const trimmed = value.trim();
  const hasExactMatch = trimmed
    ? suggestions.some(s => s.toLowerCase() === trimmed.toLowerCase())
    : false;
  const showAddCustom = trimmed && !hasExactMatch;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 p-1.5 border rounded-lg bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
        <Input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } }}
          className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 h-8"
        />
        <button
          onClick={onSubmit}
          disabled={!trimmed}
          className={`p-1.5 rounded-full transition-colors ${
            trimmed
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>

      {showSuggestions && (suggestions.length > 0 || showAddCustom) && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {showAddCustom && (
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors font-medium border-b border-border/50"
              onMouseDown={e => { e.preventDefault(); onSelectSuggestion(trimmed); }}
            >
              Add "<span className="text-primary">{trimmed}</span>"
            </button>
          )}
          {suggestions.map(s => (
            <button
              key={s}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              onMouseDown={e => { e.preventDefault(); onSelectSuggestion(s); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export default IndustryKeywordsStep;
