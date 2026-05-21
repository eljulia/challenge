/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useEffect, useState } from "react";
import { Mic, MicOff, CheckCircle2, Sparkles, PhoneOff, Loader2, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceCall, CallPhase, TranscriptEntry } from "@/hooks/useVoiceCall";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import MicDiagnosticsPanel from "@/components/onboarding/MicDiagnosticsPanel";

interface BriefingStepProps {
  formData: any;
  onChange: (field: string, value: any) => void;
  errors: Record<string, string>;
}

const CONVERSATION_TOPICS = [
  "What does your day-to-day look like and what decisions are you responsible for?",
  "Who do you want to reach on LinkedIn and what should they think after reading your posts?",
  "What topics do you have a real opinion on — where would you push back on the mainstream view?",
  "What makes a great LinkedIn post for you, and what content would you never associate with your name?",
];

const isMicDebugEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("micDebug") === "1") {
      window.localStorage.setItem("kol.micDebug", "1");
      return true;
    }
    if (params.get("micDebug") === "0") {
      window.localStorage.removeItem("kol.micDebug");
      return false;
    }
    return window.localStorage.getItem("kol.micDebug") === "1";
  } catch {
    return false;
  }
};

const BriefingStep: React.FC<BriefingStepProps> = ({ formData, onChange, errors }) => {
  const { phase, transcripts, error, summary, startCall, endCall, getFinalTranscripts, micDiagnostics } =
    useVoiceCall();

  const [showMicDebug, setShowMicDebug] = useState(() => isMicDebugEnabled());
  const titleTapCountRef = useRef({ count: 0, lastTapAt: 0 });

  // Hidden gesture: 5 quick taps on the title toggles the mic-debug panel.
  // Works in Xcode / native builds where URL params can't be used.
  const handleTitleTap = () => {
    const now = Date.now();
    const state = titleTapCountRef.current;
    if (now - state.lastTapAt > 800) {
      state.count = 1;
    } else {
      state.count += 1;
    }
    state.lastTapAt = now;

    if (state.count >= 5) {
      state.count = 0;
      const next = !showMicDebug;
      try {
        if (next) window.localStorage.setItem("kol.micDebug", "1");
        else window.localStorage.removeItem("kol.micDebug");
      } catch {
        /* ignore */
      }
      setShowMicDebug(next);
      console.log(`[BriefingStep] Mic debug ${next ? "ENABLED" : "DISABLED"} via tap gesture`);
    }
  };

  const scrollEndRef = useRef<HTMLDivElement>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizedAnswers, setSynthesizedAnswers] = useState<string[]>(
    formData.briefingAnswers || ["", "", "", ""]
  );

  // Manual typing mode: skip the voice call and let the user write their answers directly
  const [manualMode, setManualMode] = useState<boolean>(
    !!formData.briefingManualMode ||
      (Array.isArray(formData.briefingAnswers) &&
        formData.briefingAnswers.some((a: string) => (a || "").trim().length > 0) &&
        !formData.briefingTranscripts)
  );

  const isCompleted = formData.briefingCompleted || phase === "ended";
  const isActive = phase === "live" || phase === "session_ready" || phase === "ending";
  const isConnecting = phase === "connecting";
  const hasSynthesized = formData.briefingSynthesized || false;

  // Build de-duped ordered transcript list
  const displayTranscripts = React.useMemo(() => {
    const seen = new Map<string, TranscriptEntry>();
    for (const t of transcripts) {
      seen.set(`${t.turn_id}-${t.speaker}`, t);
    }
    return Array.from(seen.values()).sort((a, b) => a.turn_id - b.turn_id);
  }, [transcripts]);

  // Auto-scroll to bottom when transcripts update
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayTranscripts]);

  const synthesizeTranscripts = async (finalTranscripts: TranscriptEntry[]) => {
    setIsSynthesizing(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("synthesize-briefing", {
        body: { transcripts: finalTranscripts },
      });

      if (fnError) throw fnError;

      if (data?.answers && Array.isArray(data.answers)) {
        setSynthesizedAnswers(data.answers);
        onChange("briefingAnswers", data.answers);
        onChange("briefingSynthesized", true);
      }
    } catch (err) {
      console.error("Failed to synthesize briefing:", err);
      // Set empty answers so user can still fill them manually
      onChange("briefingSynthesized", true);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleStartCall = () => {
    startCall();
  };

  const handleEndCall = () => {
    endCall();
    const finalTranscripts = getFinalTranscripts();
    onChange("briefingCompleted", true);
    onChange("briefingTranscripts", finalTranscripts);
    synthesizeTranscripts(finalTranscripts);
  };

  // When call_end_requested ends the call automatically
  React.useEffect(() => {
    if (phase === "ended" && !formData.briefingCompleted) {
      const finalTranscripts = getFinalTranscripts();
      onChange("briefingCompleted", true);
      onChange("briefingTranscripts", finalTranscripts);
      synthesizeTranscripts(finalTranscripts);
    }
  }, [phase]);

  // Show error via formData
  React.useEffect(() => {
    if (error) {
      onChange("briefingError", error);
    }
  }, [error]);

  const handleAnswerChange = (index: number, value: string) => {
    const updated = [...synthesizedAnswers];
    updated[index] = value;
    setSynthesizedAnswers(updated);
    onChange("briefingAnswers", updated);

    // In manual mode, mark briefing as completed once all 4 answers have content
    if (manualMode) {
      const allFilled = updated.every((a) => (a || "").trim().length > 0);
      if (allFilled && !formData.briefingCompleted) {
        onChange("briefingCompleted", true);
        onChange("briefingSynthesized", true);
        onChange("briefingManualMode", true);
      }
    }
  };

  const enterManualMode = () => {
    setManualMode(true);
    onChange("briefingManualMode", true);
    onChange("briefingSynthesized", true); // show the editable answer fields immediately
  };

  const exitManualMode = () => {
    setManualMode(false);
    onChange("briefingManualMode", false);
    if (!formData.briefingTranscripts) {
      onChange("briefingSynthesized", false);
      onChange("briefingCompleted", false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1" onClick={handleTitleTap}>
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground select-none cursor-default">AI Briefing</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Have a short voice conversation with our AI to help us understand your preferences, expertise, and content
          style. This will personalize your entire experience.
        </p>
      </div>

      {/* Topics preview — hide during active call, after completion, and in manual typing mode */}
      {!isActive && !isCompleted && !manualMode && (
        <div className="grid gap-3">
          {CONVERSATION_TOPICS.map((topic, index) => (
            <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0 mt-0.5">
                {index + 1}
              </div>
              <p className="text-sm text-muted-foreground">{topic}</p>
            </div>
          ))}
        </div>
      )}

      {/* Live transcript during call */}
      {isActive && displayTranscripts.length > 0 && (
        <ScrollArea className="h-64 rounded-lg border border-border/30 bg-muted/10">
          <div className="p-3 space-y-3">
            {displayTranscripts.map((t, i) => (
              <div
                key={`${t.turn_id}-${t.speaker}-${i}`}
                className={`flex ${t.speaker === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    t.speaker === "assistant"
                      ? "bg-muted text-foreground rounded-tl-sm"
                      : "bg-primary text-primary-foreground rounded-tr-sm"
                  } ${!t.final ? "opacity-60" : ""}`}
                >
                  <p className="text-xs font-semibold mb-0.5 opacity-70">
                    {t.speaker === "assistant" ? "AI" : "You"}
                  </p>
                  <p className={`text-sm ${!t.final ? "italic" : ""}`}>
                    {t.text}
                  </p>
                </div>
              </div>
            ))}
            <div ref={scrollEndRef} />
          </div>
        </ScrollArea>
      )}

      {/* Mic diagnostics — only shown when ?micDebug=1 has been set (developer-only) */}
      {showMicDebug && (isActive || isConnecting || phase === "ended" || phase === "error") && (
        <MicDiagnosticsPanel diag={micDiagnostics} phase={phase} />
      )}

      {/* Synthesizing indicator */}
      {isSynthesizing && (
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Synthesizing your responses…</span>
        </div>
      )}

      {/* Editable answers — visible after voice synthesis OR when typing manually */}
      {(manualMode || (isCompleted && hasSynthesized && !isSynthesizing)) && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {manualMode && !formData.briefingTranscripts
              ? "Type your answers below. All four are required to continue."
              : "We've summarized your responses below. Feel free to edit them before continuing."}
          </p>
          {CONVERSATION_TOPICS.map((topic, index) => (
            <div key={index} className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm font-medium text-foreground">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0 mt-0.5">
                  {index + 1}
                </span>
                {topic}
              </label>
              <Textarea
                value={synthesizedAnswers[index] || ""}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                placeholder="Your answer…"
                className="min-h-[80px] text-sm resize-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* Completed summary (only show if not yet synthesized, e.g. fallback) */}
      {isCompleted && summary && !hasSynthesized && !isSynthesizing && (
        <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Validation error from parent (e.g. empty briefing answers) */}
      {errors?.briefing && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{errors.briefing}</p>
        </div>
      )}

      {/* Action area */}
      <div className="flex flex-col items-center gap-3 pt-2">
        {isCompleted && !isSynthesizing ? (
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">Briefing completed</span>
          </div>
        ) : isActive ? (
          <Button
            size="lg"
            variant="destructive"
            onClick={handleEndCall}
            className="gap-2 px-8 shadow-md"
          >
            <PhoneOff className="w-5 h-5" />
            End Call
          </Button>
        ) : !isCompleted && !manualMode ? (
          <>
            <Button
              size="lg"
              onClick={handleStartCall}
              disabled={isConnecting}
              className="gap-2 px-8 shadow-md shadow-primary/20"
            >
              {isConnecting ? (
                <>
                  <MicOff className="w-5 h-5 animate-pulse" />
                  Connecting…
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  Start Voice Briefing
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={enterManualMode}
              disabled={isConnecting}
              className="gap-2 text-muted-foreground"
            >
              <Keyboard className="w-4 h-4" />
              Type my answers instead
            </Button>
          </>
        ) : !isCompleted && manualMode ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={exitManualMode}
            className="gap-2 text-muted-foreground"
          >
            <Mic className="w-4 h-4" />
            Use voice briefing instead
          </Button>
        ) : null}
        {!isCompleted && !manualMode && (
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            Your responses will be synthesized into editable answers that you can review and adjust before continuing.
          </p>
        )}
      </div>
    </div>
  );
};

export default BriefingStep;
