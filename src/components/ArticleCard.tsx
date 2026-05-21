import { useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Timezone detection - same pattern as GeneratedPosts.tsx
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const isIos = /iP(ad|hone|od)/i.test(navigator.userAgent);

const safeParseDate = (ts: string | null): Date => {
  if (!ts) return new Date(NaN);
  try {
    const date = new Date(ts);
    return isNaN(date.getTime()) ? new Date(NaN) : date;
  } catch (err) {
    console.warn("Error parsing date:", ts, err);
    return new Date(NaN);
  }
};

const formatDisplayDate = (iso: string | null): string => {
  if (!iso) return "";

  // iOS Safari workaround
  if (isIos) {
    try {
      const date = new Date(iso);
      return new Intl.DateTimeFormat(undefined, {
        timeZone: userTimeZone,
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date);
    } catch {
      return "";
    }
  }

  // Non-iOS: use date-fns with timezone
  try {
    const date = safeParseDate(iso);
    if (isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(undefined, {
      timeZone: userTimeZone,
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
};

export const toSafeISO = (raw?: string | null) => {
  if (!raw) return undefined;

  let iso = raw.trim();

  // If it's already a valid ISO string, return as is
  if (iso.includes("T") && (iso.includes("Z") || iso.includes("+") || iso.includes("-"))) {
    return iso;
  }

  // If it's just a date (YYYY-MM-DD), treat it as local date
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso; // Don't add time or timezone info for date-only strings
  }

  // For datetime strings, convert space to T
  iso = iso.replace(" ", "T");

  // Fix timezone format: "+0500" ➜ "+05:00"
  iso = iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");

  return iso;
};

const PLACEHOLDER_IMAGE_PATTERNS = [
  "jeg-empty",
  "image-placeholder",
  "verge-placeholder",
  "/placeholder.",
  "default-thumbnail",
  "no-image",
  "blank.gif",
  "blank.png",
];

const isPlaceholderImage = (url?: string): boolean => {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  if (!lower) return true;
  if (lower.startsWith("data:")) return true;
  return PLACEHOLDER_IMAGE_PATTERNS.some((p) => lower.includes(p));
};

export interface Article {
  id: string;
  title: string;
  source?: string;
  image?: string;
  imageurl?: string;
  summary: string;
  url: string;
  publicationdate?: string;
  sourceName?: string;
  keywords?: string[];
}

interface ArticleCardProps {
  article: {
    id: string;
    title: string;
    source: string;
    sourceName?: string;
    image: string;
    summary: string;
    url: string;
    publicationdate?: string;
    keywords?: string[];
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  isSES?: boolean;
  isRecommended?: boolean;
  sourceType?: string;
  isManuallyAdded?: boolean;
  manuallyAddedAt?: string;
}

export function ArticleCard({
  article,
  isSelected,
  onToggleSelect,
  isSES = false,
  isRecommended = false,
  sourceType,
  isManuallyAdded,
  manuallyAddedAt,
}: ArticleCardProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);

  const iso = toSafeISO(article.publicationdate);
  const formattedDate = formatDisplayDate(iso);

  // Determine card styling and tag text based on source type
  let cardClasses = `article-card overflow-hidden transition-all duration-200 animate-fade-in p-4 relative
                    ${isSelected ? "border-primary/70 dark:border-primary/60 shadow-md" : ""}`;

  let badgeClasses = "text-xs font-medium";
  const badgeVariant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  let sourceName = article.sourceName || article.source;

  // Check if this is a "specific" source and should display "keyword"
  const isSpecificSource = sourceType === "specificsource" || article.source === "specificsource";
  const keywordsText =
    article.keywords && article.keywords.length > 0 ? article.keywords.join(", ") : "No keywords available";

  const handleKeywordClick = () => {
    if (isSpecificSource) {
      setShowKeywords(true);
      setTimeout(() => setShowKeywords(false), 2000); // Show for 2 seconds
    }
  };

  if (isManuallyAdded) {
    cardClasses += " border-teal-400 dark:border-teal-600 bg-teal-50/40 dark:bg-teal-950/20";
    badgeClasses += " bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
    sourceName = "Added by me";
  } else if (sourceType === "recommended") {
    cardClasses += " border-violet-300 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-950/20";
    badgeClasses += " bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300";
  } else if (sourceType === "ses") {
    cardClasses += " border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20";
    badgeClasses += " bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
  } else if (sourceType === "sesupload") {
    cardClasses +=
      " border-blue-300 dark:border-blue-700 bg-gradient-to-br from-blue-50/40 to-violet-50/40 dark:from-blue-950/20 dark:to-violet-950/20";
    badgeClasses +=
      " bg-gradient-to-r from-blue-100 to-violet-100 text-blue-700 dark:from-blue-900 dark:to-violet-900 dark:text-blue-300";
  }

  return (
    <Card className={cardClasses} onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>
      {isSelected && <div className="active-indicator" />}

      <div className="flex items-start gap-4">
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-full border-2 
                    flex items-center justify-center mt-0.5 transition-colors duration-200
                    ${isSelected ? "bg-primary border-primary text-white" : "border-gray-300 dark:border-gray-600"}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(article.id);
          }}
        >
          {isSelected && <Check className="h-4 w-4" strokeWidth={3} />}
        </div>

        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-start mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={badgeVariant}
                  className={`${badgeClasses} ${isSpecificSource ? "cursor-pointer" : ""}`}
                  onClick={handleKeywordClick}
                >
                  {isSpecificSource && showKeywords ? keywordsText : isSpecificSource ? "keyword" : sourceName}
                </Badge>
                {formattedDate && (
                  <Badge variant="outline" className="text-xs font-medium">
                    {formattedDate}
                  </Badge>
                )}
              </div>

              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary flex-shrink-0 ml-2"
                onClick={(e) => e.stopPropagation()}
              >
                <LinkIcon className="h-4 w-4" />
              </a>
            </div>

            <h3 className="text-base font-medium">{article.title}</h3>
          </div>

          {article.image && !isPlaceholderImage(article.image) && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block w-full my-3"
              aria-label={`Open article: ${article.title}`}
            >
              <img
                src={article.image}
                alt={article.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-40 object-cover rounded-md cursor-pointer transition-opacity hover:opacity-90"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  // First failure: try the weserv image proxy (handles hotlink-protected sources)
                  if (!img.dataset.proxied && /^https?:\/\//i.test(article.image)) {
                    img.dataset.proxied = "1";
                    const stripped = article.image.replace(/^https?:\/\//i, "");
                    img.src = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}`;
                    return;
                  }
                  // Second failure: hide
                  (img.parentElement as HTMLElement).style.display = "none";
                }}
              />
            </a>
          )}

          <p className="text-sm text-muted-foreground line-clamp-4 mt-2">{article.summary}</p>
        </div>
      </div>
    </Card>
  );
}
