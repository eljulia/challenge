import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Check, RefreshCw, Image, Share, X, Save, Globe, Languages } from "lucide-react";
import { Article } from "./ArticleCard";
import { Avatar } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isLinkedInPostUrl } from "@/utils/linkedinUrl";
import { Textarea } from "@/components/ui/textarea";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { 
  AlertDialog, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogAction,
  AlertDialogCancel 
} from "@/components/ui/alert-dialog";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LinkedInPostPreviewProps {
  postContent: string;
  article: Article;
  onEdit: () => void;
  onApprove: () => void;
  onPublish: () => void;
  onRegenerate: (language?: string) => void;
  onSave?: (content: string) => void;
  isPublishing?: boolean; 
  isRegenerating?: boolean;
  isApproved?: boolean;  
  isPublished?: boolean;
  isEditing?: boolean;
  showBothButtons?: boolean;
  availableLanguages?: string[];
}

export function LinkedInPostPreview({
  postContent,
  article,
  onEdit,
  onApprove,
  onPublish,
  onRegenerate,
  onSave,
  isPublishing = false,
  isRegenerating = false,
  isApproved = false,
  isPublished = false,
  isEditing = false,
  showBothButtons = false,
  availableLanguages = []
}: LinkedInPostPreviewProps) {
  const { toast } = useToast();
  const { isActionBlocked, isImpersonating } = useImpersonation();
  const publishBlocked = isActionBlocked('publish');
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showTranslateDialog, setShowTranslateDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [editedContent, setEditedContent] = useState(postContent ?? "");
  const [userData, setUserData] = useState<{
    name: string;
    avatar_url?: string;
  }>({ 
    name: 'LinkedIn User',
    avatar_url: undefined
  });
  
  // Update editedContent when postContent changes (guard against undefined)
  useEffect(() => {
    setEditedContent(postContent ?? "");
  }, [postContent]);
  
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          const user = session.user;
          const metadata = user.user_metadata;
          
          // Log the complete metadata for debugging
          console.log("User metadata available for LinkedIn:", metadata);
          
          // Fetch display_name from profiles table
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', user.id)
            .single();
          
          if (profileError) {
            console.error("Error fetching profile data:", profileError);
          }
          
          // NOTE: We intentionally DO NOT persist the LinkedIn token here.
          // The token is stored once in AuthCallback with the correct LinkedIn
          // 60-day expiry. Using `session.expires_in` here would incorrectly
          // overwrite the LinkedIn expiry with the Supabase JWT TTL (1 hour),
          // which causes premature logouts for active users (especially those
          // who frequently visit post-preview pages).

          // Token presence is tracked via useLinkedInTokenValidation; do not surface
          // the raw token to component state.
          setUserData({
            name: profileData?.display_name ||
                  metadata.full_name ||
                  `${metadata.firstName || ''} ${metadata.lastName || ''}`.trim() ||
                  user.email?.split('@')[0] ||
                  'LinkedIn User',
            avatar_url: profileData?.avatar_url ||
                       metadata.avatar_url ||
                       metadata.picture ||
                       (metadata.identity_data && metadata.identity_data.avatar_url),
          });
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };
    
    fetchUserData();
  }, []);

  const handleApproveClick = () => {
    setShowApproveDialog(true);
  };

  const handleApproveConfirm = () => {
    // Block scheduling while impersonating another user
    if (isActionBlocked('publish')) {
      setShowApproveDialog(false);
      toast({
        variant: "destructive",
        title: "Action blocked",
        description: "Scheduling is disabled while viewing as another user.",
      });
      return;
    }

    // Close the approval dialog
    setShowApproveDialog(false);

    // First show success popup
    setShowSuccessPopup(true);

    // Then after popup has been shown for 1.5 seconds:
    // 1. Hide popup
    // 2. Move to approved tab
    setTimeout(() => {
      setShowSuccessPopup(false);
      onApprove();
      // Only show the publish dialog after approval if not already published
      if (!isPublished) {
        setShowPublishDialog(true);
      }
    }, 1500);
  };

  const handlePublishToLinkedIn = () => {
    // Hard block: never publish to LinkedIn while impersonating another user
    if (isActionBlocked('publish')) {
      toast({
        variant: "destructive",
        title: "Action blocked",
        description: "Publishing is disabled while viewing as another user.",
      });
      setShowPublishDialog(false);
      return;
    }
    
    // Close the publish dialog
    setShowPublishDialog(false);
    
    // Call the publish function from parent
    onPublish();
  };
  
  const handleSaveEdit = () => {
    if (onSave) {
      onSave(editedContent);
    }
  };
  
  const handleRegenerateClick = () => {
    setShowRegenerateDialog(true);
  };
  
  const handleRegenerateConfirm = () => {
    setShowRegenerateDialog(false);
    onRegenerate(undefined);
  };

  const handleTranslateClick = () => {
    setShowTranslateDialog(true);
  };

  const handleTranslateConfirm = () => {
    if (!selectedLanguage) return;
    setShowTranslateDialog(false);
    onRegenerate(selectedLanguage);
    setSelectedLanguage("");
  };

  // --- Helpers de sanitización mínima (sin dependencias) ---
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // Render seguro con soporte a **bold**, *italic* y saltos de línea.
  const renderSafeFormattedContent = () => {
    if (typeof postContent !== "string" || postContent.length > 10000) {
      console.warn("Invalid or oversized post content detected");
      return "Invalid content";
    }

    // 1) Escapamos todo para evitar HTML arbitrario (XSS)
    let formattedContent = escapeHtml(postContent.trim());

    // 2) Marcado ligero: **negrita**, *itálica*
    formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
    formattedContent = formattedContent.replace(
      /(?<!\*)\*([^*]+)\*(?!\*)/g,
      "<i>$1</i>"
    );

    // 3) Saltos de línea visibles
    formattedContent = formattedContent.replace(/\n/g, "<br />");

    return formattedContent;
  };
  // --- fin helpers ---

  // Check if article image URL is valid and accessible
  const articleImageUrl = article?.imageurl || article?.image || '';
  const hasValidImage = articleImageUrl !== '';
  
  // Determine the main action button(s) based on state
  const renderMainActionButton = () => {
    if (isPublished) {
      return (
        <Button disabled className="bg-green-600 hover:bg-green-700">
          <Check className="h-4 w-4 mr-2" />
          Published
        </Button>
      );
    }
    
    if (isApproved && !showBothButtons) {
      // For scheduled posts, don't show any action button since they'll be auto-published
      return null;
    }
    
    if (isApproved && showBothButtons) {
      return (
        <Button 
          onClick={() => setShowPublishDialog(true)} 
          className="bg-linkedin hover:bg-linkedin-dark"
          disabled={isPublishing || isRegenerating}
        >
          {isPublishing ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Publishing...
            </>
          ) : (
            <>
              <Share className="h-4 w-4 mr-2" />
              Publish Now
            </>
          )}
        </Button>
      );
    }
    
    // For editing posts, show both buttons if showBothButtons is true
    if (showBothButtons) {
      return (
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowPublishDialog(true)} 
            variant="outline"
            disabled={isPublishing || isEditing || isRegenerating}
            className="flex-1"
          >
            {isPublishing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Share className="h-4 w-4 mr-2" />
                Publish Now
              </>
            )}
          </Button>
          <Button 
            onClick={handleApproveClick} 
            className="bg-linkedin hover:bg-linkedin-dark flex-1"
            disabled={isPublishing || isEditing || isRegenerating}
          >
            {isPublishing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Schedule
              </>
            )}
          </Button>
        </div>
      );
    }
    
    return (
      <Button 
        onClick={handleApproveClick} 
        className="bg-linkedin hover:bg-linkedin-dark"
        disabled={isPublishing || isEditing || isRegenerating}
      >
        {isPublishing ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Check className="h-4 w-4 mr-2" />
            Schedule
          </>
        )}
      </Button>
    );
  };
  
  return (
    <Card className="linkedin-card w-full animate-fade-in p-4">
      <div className="flex items-center gap-3 mb-4">
        <Avatar>
          {userData.avatar_url ? (
            <div 
              className="w-full h-full bg-cover bg-center" 
              style={{ backgroundImage: `url(${userData.avatar_url})` }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary to-primary-foreground" />
          )}
        </Avatar>
        <div className="flex-1">
          <div className="font-semibold">{userData.name}</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="h-3 w-3" />
            <span>Public</span>
          </div>
        </div>
        <Badge variant="outline" className="font-medium gap-1 bg-background/50">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          {isPublished ? "Published" : isApproved ? "Scheduled" : isEditing ? "Editing" : isRegenerating ? "Regenerating" : "Preview"}
        </Badge>
      </div>
      
      {isEditing ? (
        <Textarea 
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="mb-4 min-h-[120px]"
          placeholder="Write your LinkedIn post here..."
        />
      ) : (
        <div 
          className="whitespace-pre-line text-sm mb-4 px-1"
          dangerouslySetInnerHTML={{ __html: renderSafeFormattedContent() }}
        />
      )}
      
      {isLinkedInPostUrl(article.url) ? (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-4"
        >
          <Card className="border rounded-md overflow-hidden bg-muted/20 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 px-4 pt-3 text-[11px] text-muted-foreground">
              <Share className="h-3 w-3 text-linkedin" />
              <span>Reposting · {article.source || "LinkedIn"}</span>
            </div>
            {hasValidImage && (
              <div
                className="w-full h-40 bg-cover bg-center mt-3"
                style={{ backgroundImage: `url(${articleImageUrl})` }}
              />
            )}
            <div className="p-4 space-y-1">
              <h4 className="font-medium text-sm line-clamp-2">{article.title}</h4>
              {article.summary && (
                <p className="text-xs text-muted-foreground line-clamp-3">{article.summary}</p>
              )}
            </div>
          </Card>
        </a>
      ) : (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mb-4"
        >
          <Card className="border rounded-md overflow-hidden hover:bg-muted/30 transition-colors">
            {hasValidImage ? (
              <div
                className="w-full h-40 bg-cover bg-center"
                style={{ backgroundImage: `url(${articleImageUrl})` }}
              />
            ) : (
              <div className="w-full h-40 bg-muted flex items-center justify-center">
                <Image className="h-12 w-12 text-muted-foreground opacity-40" />
              </div>
            )}
            <div className="p-4 space-y-1">
              <div className="text-xs text-muted-foreground">{article.source}</div>
              <h4 className="font-medium text-sm">{article.title}</h4>
              <p className="text-xs text-muted-foreground line-clamp-2">{article.summary}</p>
            </div>
          </Card>
        </a>
      )}
      
      <Separator className="my-3" />
      
      <div className="mt-4 flex flex-col gap-2 px-2">
        {!isPublished && (
          <div className="flex gap-2 justify-center">
            {isEditing ? (
              <Button onClick={handleSaveEdit} variant="outline" className="gap-1 w-full" disabled={isPublishing || isRegenerating}>
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            ) : (
              <>
                <Button onClick={onEdit} variant="outline" className="gap-1" disabled={isPublishing || isEditing || isRegenerating}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                
                <Button onClick={handleRegenerateClick} variant="outline" className="gap-1" disabled={isPublishing || isEditing || isRegenerating}>
                  {isRegenerating ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isRegenerating ? "Regenerating..." : "Regenerate"}
                </Button>

                {availableLanguages.length > 1 && (
                  <Button onClick={handleTranslateClick} variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled={isPublishing || isEditing || isRegenerating} title="Translate">
                    <Globe className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        
        {!isEditing && renderMainActionButton()}
      </div>
      
      {/* Approval Confirmation Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add the post to your scheduled content. It will be automatically published to LinkedIn at the scheduled time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveConfirm} className="bg-linkedin hover:bg-linkedin-dark">
              <Check className="h-4 w-4 mr-2" />
              Schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Success Popup */}
      <AlertDialog open={showSuccessPopup} onOpenChange={setShowSuccessPopup}>
        <AlertDialogContent className="max-w-xs mx-auto">
          <div className="text-center py-4">
            <div className="mx-auto mb-4 bg-linkedin/10 w-16 h-16 rounded-full flex items-center justify-center">
              <Check className="h-8 w-8 text-linkedin" />
            </div>
            <AlertDialogTitle className="text-xl">Awesome!</AlertDialogTitle>
            <AlertDialogDescription className="mt-2">
              Your post has been scheduled!
            </AlertDialogDescription>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Error Popup */}
      <AlertDialog open={showErrorPopup} onOpenChange={setShowErrorPopup}>
        <AlertDialogContent className="max-w-xs mx-auto">
          <div className="text-center py-4">
            <div className="mx-auto mb-4 bg-destructive/10 w-16 h-16 rounded-full flex items-center justify-center">
              <X className="h-8 w-8 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl">Publishing Failed</AlertDialogTitle>
            <AlertDialogDescription className="mt-2">
              {errorMessage || "Unable to publish to LinkedIn. Please try again later."}
            </AlertDialogDescription>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Publish to LinkedIn Dialog */}
      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share to LinkedIn</DialogTitle>
            <DialogDescription>
              Your post is approved. Would you like to publish it to your LinkedIn profile now?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 my-4">
            <div className="p-2 rounded-full bg-linkedin/10">
              <Share className="h-5 w-5 text-linkedin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">LinkedIn</p>
              <p className="text-xs text-muted-foreground">Share as {userData.name}</p>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button 
              variant="outline" 
              onClick={() => setShowPublishDialog(false)}
              disabled={isPublishing}
            >
              Later
            </Button>
            <Button
              onClick={handlePublishToLinkedIn}
              disabled={isPublishing || publishBlocked}
              className="bg-linkedin hover:bg-linkedin-dark"
              title={publishBlocked ? "Disabled while viewing as another user" : undefined}
            >
              {isPublishing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Share className="h-4 w-4 mr-2" />
                  Publish now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Regenerate Dialog */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current content with fresh AI-generated text for this article.
              Your current edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateConfirm}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Translate Dialog */}
      <AlertDialog open={showTranslateDialog} onOpenChange={(open) => {
        setShowTranslateDialog(open);
        if (!open) setSelectedLanguage("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Translate this post</AlertDialogTitle>
            <AlertDialogDescription>
              Select a language to regenerate this post in. Your current content will be replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTranslateConfirm} disabled={!selectedLanguage}>
              <Languages className="h-4 w-4 mr-2" />
              Translate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
