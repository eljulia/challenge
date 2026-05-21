/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useRef, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { Microphone } from "@mozartec/capacitor-microphone";
import { NativePcmMicrophone } from "@/plugins/nativePcmMicrophone";
import { supabase } from "@/integrations/supabase/client";

const VOICE_BACKEND_URL = import.meta.env.VITE_VOICE_BACKEND_URL as string | undefined;
const VOICE_SERVICE_NAME = "kol_ses";
const MIC_CHUNK_SAMPLES = 800; // ~50ms at 16kHz
const TARGET_SAMPLE_RATE = 16000;

export interface TranscriptEntry {
  speaker: "user" | "assistant";
  text: string;
  turn_id: number;
  final: boolean;
}

export interface SessionConfig {
  playback_guard_ms: number;
  assistant_audio_playback_rate: number;
  fixed_message_playback_rate: number;
  mic_voice_threshold: number;
  mic_voice_hold_ms: number;
  will_play_intro: boolean;
}

export type CallPhase =
  | "idle"
  | "connecting"
  | "session_ready"
  | "live"
  | "ending"
  | "ended"
  | "error";

export interface MicDiagnostics {
  source: "none" | "native-ios" | "web-audio";
  permission: "unknown" | "prompt" | "granted" | "denied";
  chunksPerInterval: number;
  totalChunks: number;
  peak: number;
  sampleRate: number;
  trackLabel: string | null;
  trackMuted: boolean | null;
  lastError: string | null;
  lastUpdatedAt: number;
}

export interface VoiceCallState {
  phase: CallPhase;
  transcripts: TranscriptEntry[];
  error: string | null;
  summary: string | null;
  micDiagnostics: MicDiagnostics;
}

interface CreateCallResponse {
  call_id: string;
  ws_url?: string;
  model?: string;
  voice_name?: string;
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const toWebSocketBaseUrl = (value: string) =>
  value.replace(/^http/i, (scheme) => (scheme.toLowerCase() === "https" ? "wss" : "ws"));

const decodeBase64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const encodeBytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const pcm16BytesToFloat32 = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const float32 = new Float32Array(bytes.byteLength / 2);
  for (let index = 0; index < float32.length; index += 1) {
    float32[index] = view.getInt16(index * 2, true) / 32768;
  }
  return float32;
};

const float32ToPcm16 = (samples: Float32Array) => {
  const pcm16 = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm16[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return pcm16;
};

/** Linear interpolation resample from sourceSR → targetSR */
const resampleLinear = (input: Float32Array, sourceSR: number, targetSR: number): Float32Array => {
  if (sourceSR === targetSR) return input;
  const ratio = sourceSR / targetSR;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIndex - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return output;
};

const parseJson = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export function useVoiceCall() {
  const initialDiagnostics: MicDiagnostics = {
    source: "none",
    permission: "unknown",
    chunksPerInterval: 0,
    totalChunks: 0,
    peak: 0,
    sampleRate: 0,
    trackLabel: null,
    trackMuted: null,
    lastError: null,
    lastUpdatedAt: 0,
  };

  const [state, setState] = useState<VoiceCallState>({
    phase: "idle",
    transcripts: [],
    error: null,
    summary: null,
    micDiagnostics: initialDiagnostics,
  });

  const updateDiagnostics = (patch: Partial<MicDiagnostics>) => {
    setState((current) => ({
      ...current,
      micDiagnostics: { ...current.micDiagnostics, ...patch, lastUpdatedAt: Date.now() },
    }));
  };

  const phaseRef = useRef<CallPhase>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const sessionConfigRef = useRef<SessionConfig | null>(null);
  const transcriptsRef = useRef<TranscriptEntry[]>([]);
  const lastFinalTranscriptsRef = useRef<TranscriptEntry[]>([]);
  const nextPlaybackTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const guardUntilRef = useRef(0);
  const pendingEndRef = useRef(false);
  const micBufferRef = useRef<Int16Array>(new Int16Array(0));
  const actualSampleRateRef = useRef(TARGET_SAMPLE_RATE);
  const fixedMsgCounterRef = useRef(-100);
  const nativeMicListenersRef = useRef<PluginListenerHandle[]>([]);
  const nativeMicDiagIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

  const setPhase = (phase: CallPhase) => {
    phaseRef.current = phase;
    setState((current) => ({ ...current, phase }));
  };

  const setError = (message: string) => {
    phaseRef.current = "error";
    setState((current) => ({ ...current, phase: "error", error: message }));
  };

  const resetCallState = () => {
    sessionConfigRef.current = null;
    transcriptsRef.current = [];
    nextPlaybackTimeRef.current = 0;
    isPlayingRef.current = false;
    guardUntilRef.current = 0;
    pendingEndRef.current = false;
    micBufferRef.current = new Int16Array(0);
    actualSampleRateRef.current = TARGET_SAMPLE_RATE;
  };

  const pushTranscript = (entry: TranscriptEntry) => {
    const updated = [...transcriptsRef.current];
    const existingIndex = updated.findIndex(
      (item) => item.turn_id === entry.turn_id && item.speaker === entry.speaker
    );
    if (existingIndex >= 0) {
      // Update in place — keep position for partial→final updates
      updated[existingIndex] = entry;
    } else {
      updated.push(entry);
    }
    transcriptsRef.current = updated;
    setState((current) => ({ ...current, transcripts: updated }));
  };

  const stopNativeMicCapture = () => {
    if (nativeMicDiagIntervalRef.current) {
      clearInterval(nativeMicDiagIntervalRef.current);
      nativeMicDiagIntervalRef.current = null;
    }
    nativeMicListenersRef.current.forEach((listener) => {
      void listener.remove().catch(() => undefined);
    });
    nativeMicListenersRef.current = [];
    if (isNativeIOS) {
      void NativePcmMicrophone.stop().catch(() => undefined);
      void NativePcmMicrophone.removeAllListeners().catch(() => undefined);
    }
  };

  const cleanup = ({ closeWebSocket = true }: { closeWebSocket?: boolean } = {}) => {
    stopNativeMicCapture();
    if ((workletNodeRef as any).diagInterval) {
      clearInterval((workletNodeRef as any).diagInterval);
      (workletNodeRef as any).diagInterval = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }
    if (mediaSourceRef.current) {
      mediaSourceRef.current.disconnect();
      mediaSourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (pendingStreamRef.current) {
      pendingStreamRef.current.getTracks().forEach((track) => track.stop());
      pendingStreamRef.current = null;
    }
    if (captureCtxRef.current) {
      captureCtxRef.current.close().catch(() => undefined);
      captureCtxRef.current = null;
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => undefined);
      playbackCtxRef.current = null;
    }
    if (closeWebSocket && wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
    }
    wsRef.current = null;
    resetCallState();
  };

  const finishEnd = () => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "end_call" }));
    }
    cleanup();
    setPhase("ended");
  };

  const schedulePlayback = (base64Audio: string, sampleRate: number, playbackRate: number) => {
    const playbackContext = playbackCtxRef.current;
    if (!playbackContext) return;

    const bytes = decodeBase64ToBytes(base64Audio);
    const float32 = pcm16BytesToFloat32(bytes);
    const audioBuffer = playbackContext.createBuffer(1, float32.length, sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const sourceNode = playbackContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.playbackRate.value = playbackRate;
    sourceNode.connect(playbackContext.destination);

    const startTime = Math.max(playbackContext.currentTime, nextPlaybackTimeRef.current);
    const playbackDuration = audioBuffer.duration / playbackRate;

    sourceNode.start(startTime);
    nextPlaybackTimeRef.current = startTime + playbackDuration;
    isPlayingRef.current = true;

    sourceNode.onended = () => {
      guardUntilRef.current = Date.now() + (sessionConfigRef.current?.playback_guard_ms ?? 0);
      if (playbackContext.currentTime >= nextPlaybackTimeRef.current - 0.05) {
        isPlayingRef.current = false;
        if (pendingEndRef.current) {
          finishEnd();
        }
      }
    };
  };

  const sendAudioChunk = (chunk: Int16Array) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (phaseRef.current !== "live" && phaseRef.current !== "session_ready") return;

    const bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    socket.send(
      JSON.stringify({
        type: "audio",
        data: encodeBytesToBase64(bytes),
      })
    );
  };

  const handleMicChunk = useCallback((samples: Float32Array) => {
    if (isPlayingRef.current || Date.now() < guardUntilRef.current) return;

    // Resample from actual capture rate to 16kHz if needed
    const resampled = resampleLinear(samples, actualSampleRateRef.current, TARGET_SAMPLE_RATE);
    const pcm16 = float32ToPcm16(resampled);

    const merged = new Int16Array(micBufferRef.current.length + pcm16.length);
    merged.set(micBufferRef.current);
    merged.set(pcm16, micBufferRef.current.length);
    micBufferRef.current = merged;

    while (micBufferRef.current.length >= MIC_CHUNK_SAMPLES) {
      const chunk = micBufferRef.current.slice(0, MIC_CHUNK_SAMPLES);
      micBufferRef.current = micBufferRef.current.slice(MIC_CHUNK_SAMPLES);
      sendAudioChunk(chunk);
    }
  }, []);

  const attachScriptProcessor = (
    captureContext: AudioContext,
    sourceNode: MediaStreamAudioSourceNode,
    silentGain: GainNode
  ) => {
    const processorNode = captureContext.createScriptProcessor(2048, 1, 1);
    processorNode.onaudioprocess = (event) => {
      handleMicChunk(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    sourceNode.connect(processorNode);
    processorNode.connect(silentGain);
    workletNodeRef.current = processorNode;
  };

  const pendingStreamRef = useRef<MediaStream | null>(null);

  /**
   * On native iOS/Android, request the OS microphone permission first.
   *
   * For the onboarding briefing we now keep BOTH capture and playback inside
   * the WKWebView/Web Audio stack on iPhone. That avoids the fragile split
   * setup where native AVAudioEngine owns the microphone while WKWebView owns
   * assistant playback, which can break two-way audio routing on physical
   * iPhones.
   */
  const ensureNativeMicPermission = async (): Promise<void> => {
    try {
      if (!Capacitor.isNativePlatform()) return;

      let status = await Microphone.checkPermissions();
      console.log("[VoiceCall] Native mic permission status:", status.microphone);
      updateDiagnostics({ permission: status.microphone as MicDiagnostics["permission"] });

      if (status.microphone === "prompt") {
        status = await Microphone.requestPermissions();
        console.log("[VoiceCall] Native mic permission request result:", status.microphone);
        updateDiagnostics({ permission: status.microphone as MicDiagnostics["permission"] });
      }

      if (status.microphone === "denied") {
        throw new Error(
          "Microphone permission is blocked. Please enable it in your device Settings → KOL → Microphone, then try again."
        );
      }
    } catch (err: any) {
      if (err?.message?.includes("Microphone permission")) throw err;
      console.warn("[VoiceCall] Native mic permission check failed:", err);
    }
  };

  const requestMicrophonePermission = async (): Promise<MediaStream> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Microphone is not available in this browser. Please use Safari (iOS), Chrome (Android), or open the app on a device that supports microphone access."
      );
    }

    if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
      throw new Error("Microphone access requires a secure (HTTPS) connection.");
    }

    // Native platforms first — request OS-level permission via Capacitor plugin.
    // This shows a proper system dialog and waits for the user's response.
    await ensureNativeMicPermission();

    // Web platforms: proactively check Permissions API for clearer denial errors
    try {
      // @ts-expect-error — not all browsers type "microphone"
      const status = await navigator.permissions?.query?.({ name: "microphone" as PermissionName });
      if (status?.state === "denied") {
        throw new Error(
          "Microphone permission is blocked. Please enable it in your browser/device settings (Site Settings → Microphone) and try again."
        );
      }
    } catch (e: any) {
      if (e?.message?.startsWith("Microphone permission is blocked")) throw e;
      // permissions API may not exist — that's fine, fall through
    }

    // Retry on transient failures (e.g. mic busy / aborted prompt). Do NOT
    // retry on hard denial (NotAllowedError) so the user's "no" is respected
    // and they can simply click again to retrigger the request.
    const MAX_ATTEMPTS = 2;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: isNativeIOS
            ? true
            : {
                sampleRate: TARGET_SAMPLE_RATE,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
              },
        });
      } catch (err: any) {
        lastErr = err;
        const name = err?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
          break;
        }
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[VoiceCall] getUserMedia attempt ${attempt} failed (${name}), retrying…`);
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    }

    const name = lastErr?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new Error(
        "Microphone permission was denied. Tap Start Voice Briefing again to retry, or open Settings → KOL → Microphone to allow access."
      );
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new Error("No microphone was found on this device.");
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      throw new Error("Your microphone is being used by another app. Please close it and try again.");
    }
    if (name === "SecurityError") {
      throw new Error("Microphone access is blocked by your browser's security settings.");
    }
    throw new Error(lastErr?.message || "Could not access the microphone.");
  };

  const startBrowserMicCapture = async () => {
    const captureContext = captureCtxRef.current;
    if (!captureContext) throw new Error("Capture audio context is not ready");

    actualSampleRateRef.current = captureContext.sampleRate;
    console.log(`[VoiceCall] Capture AudioContext sampleRate: ${captureContext.sampleRate}, state: ${captureContext.state}`);

    if (captureContext.state === "suspended") {
      try {
        await captureContext.resume();
        console.log(`[VoiceCall] Capture context resumed → ${captureContext.state}`);
      } catch (e) {
        console.warn("[VoiceCall] Capture context resume failed:", e);
      }
    }

    let stream = pendingStreamRef.current ?? (await requestMicrophonePermission());
    pendingStreamRef.current = null;

    // iOS quirk: the FIRST getUserMedia call from inside a click handler sometimes
    // returns a track that is already `muted=true` and never unmutes. If we detect
    // that, throw the stream away and ask again — the second call gives a healthy
    // unmuted track. Harmless on Android/web (their tracks are never muted here).
    let audioTracks = stream.getAudioTracks();
    const firstTrackMuted = audioTracks[0]?.muted === true;
    if (firstTrackMuted && isNativeIOS) {
      console.warn("[VoiceCall] iOS returned a pre-muted mic track — re-requesting fresh stream");
      stream.getTracks().forEach((track) => track.stop());
      // Small delay lets iOS release the audio session before the second request.
      await new Promise((resolve) => setTimeout(resolve, 150));
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioTracks = stream.getAudioTracks();
    }

    console.log(`[VoiceCall] Got ${audioTracks.length} audio track(s)`);
    audioTracks.forEach((track, i) => {
      console.log(
        `[VoiceCall] Track ${i}: label="${track.label}" enabled=${track.enabled} muted=${track.muted} readyState=${track.readyState}`
      );
      try {
        const settings = track.getSettings();
        console.log(`[VoiceCall] Track ${i} settings:`, JSON.stringify(settings));
      } catch {
        /* not all WebViews implement getSettings */
      }
      track.enabled = true;
      track.onmute = () => console.warn(`[VoiceCall] Track ${i} MUTED by system`);
      track.onunmute = () => console.log(`[VoiceCall] Track ${i} unmuted`);
      track.onended = () => console.warn(`[VoiceCall] Track ${i} ended`);
    });

    mediaStreamRef.current = stream;
    const sourceNode = captureContext.createMediaStreamSource(stream);
    const silentGain = captureContext.createGain();
    silentGain.gain.value = 0;
    silentGain.connect(captureContext.destination);

    mediaSourceRef.current = sourceNode;
    silentGainRef.current = silentGain;

    const firstTrack = audioTracks[0] ?? null;
    updateDiagnostics({
      source: "web-audio",
      permission: "granted",
      sampleRate: captureContext.sampleRate,
      trackLabel: firstTrack?.label ?? null,
      trackMuted: firstTrack ? firstTrack.muted : null,
      lastError: null,
    });
    if (firstTrack) {
      firstTrack.onmute = () => {
        console.warn("[VoiceCall] Track MUTED by system");
        updateDiagnostics({ trackMuted: true });
      };
      firstTrack.onunmute = () => {
        console.log("[VoiceCall] Track unmuted");
        updateDiagnostics({ trackMuted: false });
      };
    }

    let chunkCount = 0;
    let peakLevel = 0;
    let totalChunks = 0;
    const diagInterval = setInterval(() => {
      console.log(
        `[VoiceCall] Mic diag: ${chunkCount} chunks/2s, peak=${peakLevel.toFixed(4)}` +
          (peakLevel < 0.001 ? " ⚠️ SILENCE — mic is not capturing audio" : "")
      );
      updateDiagnostics({
        chunksPerInterval: chunkCount,
        peak: peakLevel,
        totalChunks,
      });
      chunkCount = 0;
      peakLevel = 0;
    }, 2000);
    (workletNodeRef as any).diagInterval = diagInterval;

    const wrappedHandler = (samples: Float32Array) => {
      chunkCount += 1;
      totalChunks += 1;
      for (let i = 0; i < samples.length; i += 1) {
        const abs = Math.abs(samples[i]);
        if (abs > peakLevel) peakLevel = abs;
      }
      handleMicChunk(samples);
    };

    try {
      const workletSource = `class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length) {
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);`;

      const workletUrl = URL.createObjectURL(new Blob([workletSource], { type: "application/javascript" }));
      await captureContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const workletNode = new AudioWorkletNode(captureContext, "pcm-processor");
      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        wrappedHandler(event.data);
      };

      sourceNode.connect(workletNode);
      workletNode.connect(silentGain);
      workletNodeRef.current = workletNode;
      (workletNodeRef as any).diagInterval = diagInterval;
      console.log("[VoiceCall] AudioWorklet mic capture started");
    } catch (e) {
      console.log("[VoiceCall] AudioWorklet failed, falling back to ScriptProcessor:", e);
      const processorNode = captureContext.createScriptProcessor(2048, 1, 1);
      processorNode.onaudioprocess = (event) => {
        wrappedHandler(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      sourceNode.connect(processorNode);
      processorNode.connect(silentGain);
      workletNodeRef.current = processorNode;
      (workletNodeRef as any).diagInterval = diagInterval;
    }
  };

  const startNativeIOSMicCapture = async () => {
    stopNativeMicCapture();

    const permissionStream = pendingStreamRef.current ?? (await requestMicrophonePermission());
    pendingStreamRef.current = null;

    const audioTracks = permissionStream.getAudioTracks();
    console.log(`[VoiceCall] Native iOS mic permission stream tracks: ${audioTracks.length}`);
    audioTracks.forEach((track, i) => {
      console.log(
        `[VoiceCall] Native iOS track ${i}: label="${track.label}" enabled=${track.enabled} muted=${track.muted} readyState=${track.readyState}`
      );
    });
    permissionStream.getTracks().forEach((track) => track.stop());

    let chunkCount = 0;
    let peakLevel = 0;
    let totalChunks = 0;
    let zeroChunkIntervals = 0;
    let fallbackStarted = false;

    updateDiagnostics({
      source: "native-ios",
      sampleRate: TARGET_SAMPLE_RATE,
      trackLabel: "iOS AVAudioEngine",
      trackMuted: null,
      lastError: null,
    });

    const fallbackToWebCapture = async (reason: string) => {
      if (fallbackStarted || phaseRef.current === "ended" || phaseRef.current === "error") return;
      fallbackStarted = true;
      console.warn(`[VoiceCall] ${reason} Falling back to Web Audio capture.`);
      updateDiagnostics({ lastError: reason });
      stopNativeMicCapture();
      try {
        await startBrowserMicCapture();
      } catch (fallbackError: any) {
        console.error("[VoiceCall] Web fallback mic capture failed:", fallbackError);
        setError(fallbackError?.message || reason);
        cleanup();
      }
    };

    nativeMicDiagIntervalRef.current = setInterval(() => {
      console.log(`[VoiceCall] Native mic diag: ${chunkCount} chunks/2s, peak=${peakLevel.toFixed(4)}`);
      updateDiagnostics({
        chunksPerInterval: chunkCount,
        peak: peakLevel,
        totalChunks,
      });
      zeroChunkIntervals = chunkCount === 0 ? zeroChunkIntervals + 1 : 0;
      if (zeroChunkIntervals >= 2) {
        void fallbackToWebCapture("Native iOS mic produced no audio chunks for 4 seconds.");
      }
      chunkCount = 0;
      peakLevel = 0;
    }, 2000);

    const pcmChunkListener = await NativePcmMicrophone.addListener("pcmChunk", (event) => {
      chunkCount += 1;
      totalChunks += 1;
      peakLevel = Math.max(peakLevel, event.peak ?? 0);
      zeroChunkIntervals = 0;

      if (isPlayingRef.current || Date.now() < guardUntilRef.current) return;

      const bytes = decodeBase64ToBytes(event.data);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const chunk = new Int16Array(bytes.byteLength / 2);
      for (let i = 0; i < chunk.length; i += 1) {
        chunk[i] = view.getInt16(i * 2, true);
      }
      sendAudioChunk(chunk);
    });

    const pcmErrorListener = await NativePcmMicrophone.addListener("pcmError", (event) => {
      console.error("[VoiceCall] Native mic error:", event.message);
      if (phaseRef.current === "ended" || phaseRef.current === "error") return;
      void fallbackToWebCapture(event.message || "Native microphone capture failed.");
    });

    nativeMicListenersRef.current = [pcmChunkListener, pcmErrorListener];

    try {
      const result = await NativePcmMicrophone.start({
        sampleRate: TARGET_SAMPLE_RATE,
        chunkSamples: MIC_CHUNK_SAMPLES,
      });
      console.log(`[VoiceCall] Native iOS mic capture started (${result.sampleRate}Hz, ${result.chunkSamples} samples/chunk)`);
    } catch (error: any) {
      console.error("[VoiceCall] Native iOS mic start failed:", error);
      await fallbackToWebCapture(error?.message || "Native iOS microphone failed to start.");
    }
  };

  const startMicCapture = async () => {
    if (isNativeIOS) {
      console.log("[VoiceCall] iOS briefing using WKWebView/Web Audio capture path");
    }
    await startBrowserMicCapture();
  };

  const handleWsMessage = async (message: any) => {
    console.log(`[VoiceCall] WS message: ${message.type}`);

    switch (message.type) {
      case "session_ready": {
        sessionConfigRef.current = {
          playback_guard_ms: message.playback_guard_ms ?? 0,
          assistant_audio_playback_rate: message.assistant_audio_playback_rate ?? 1,
          fixed_message_playback_rate: message.fixed_message_playback_rate ?? 1,
          mic_voice_threshold: message.mic_voice_threshold ?? 0,
          mic_voice_hold_ms: message.mic_voice_hold_ms ?? 0,
          will_play_intro: message.will_play_intro ?? false,
        };

        setPhase("session_ready");

        try {
          await startMicCapture();
          wsRef.current?.send(JSON.stringify({ type: "client_ready" }));
          console.log("[VoiceCall] client_ready sent");
        } catch (err: any) {
          console.error("[VoiceCall] Mic capture failed:", err);
          setError(err?.message || "Microphone access denied");
          cleanup();
        }
        break;
      }

      case "live_ready":
        setPhase("live");
        console.log("[VoiceCall] Phase: live — mic audio will now be sent");
        break;

      case "fixed_message":
        if (message.audio) {
          schedulePlayback(
            message.audio,
            message.sample_rate_hz || 24000,
            sessionConfigRef.current?.fixed_message_playback_rate ?? 1
          );
        }
        if (message.text) {
          pushTranscript({
            speaker: "assistant",
            text: message.text,
            turn_id: message.turn_id ?? fixedMsgCounterRef.current--,
            final: true,
          });
        }
        break;

      case "audio":
        if (message.data) {
          schedulePlayback(
            message.data,
            24000,
            sessionConfigRef.current?.assistant_audio_playback_rate ?? 1
          );
        }
        break;

      case "transcript":
        pushTranscript({
          speaker: message.speaker,
          text: message.text,
          turn_id: message.turn_id,
          final: message.final,
        });
        break;

      case "assistant_turn":
        break;

      case "call_end_requested": {
        // Snapshot transcripts before cleanup
        const finalSnapshot = transcriptsRef.current.filter((entry) => entry.final);
        lastFinalTranscriptsRef.current = finalSnapshot;

        setState((current) => ({ ...current, summary: message.summary || null }));
        setPhase("ending");

        // Stop mic immediately
        stopNativeMicCapture();
        if (workletNodeRef.current) {
          workletNodeRef.current.disconnect();
          workletNodeRef.current = null;
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        // Wait for any remaining playback, then fully end
        pendingEndRef.current = true;
        if (!isPlayingRef.current) {
          finishEnd();
        }
        break;
      }

      case "error":
        setError(message.message || "Unknown error from voice server");
        cleanup();
        break;

      default:
        console.log(`[VoiceCall] Unhandled message type: ${message.type}`);
        break;
    }
  };

  const startCall = async () => {
    if (!VOICE_BACKEND_URL) {
      setError("Voice backend URL not configured");
      return;
    }

    cleanup();
    resetCallState();

    // CRITICAL (iOS WKWebView / Safari):
    // Both the microphone permission AND the AudioContexts must be
    // created + resumed *synchronously inside the user gesture* (button
    // click) BEFORE any awaits / network requests. Otherwise the
    // AudioContext stays "suspended" and the MediaStreamSourceNode
    // produces silence — the user can hear the AI but the AI hears
    // nothing back. Also: iOS WKWebView does NOT honor a custom
    // `sampleRate` option on AudioContext — passing one can either throw
    // or produce a broken context. We let the OS pick its native rate
    // (typically 48000) and resample to 16kHz in `handleMicChunk`.
    try {
      // 1. Create AudioContexts immediately (still inside the click gesture).
      const AudioContextCtor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Web Audio is not supported in this browser.");
      }
      playbackCtxRef.current = new AudioContextCtor();
      captureCtxRef.current = new AudioContextCtor();

      // Kick off resume() synchronously — we'll await below, but the
      // call itself happens within the gesture which is what iOS checks.
      const playbackResume = playbackCtxRef.current.resume();
      const captureResume = captureCtxRef.current.resume();

      // 2. Request mic permission (also tied to the gesture).
      pendingStreamRef.current = await requestMicrophonePermission();

      await playbackResume;
      await captureResume;
    } catch (err: any) {
      console.error("[VoiceCall] Mic / AudioContext init failed:", err);
      setError(err?.message || "Microphone access denied");
      cleanup();
      return;
    }

    phaseRef.current = "connecting";
    setState((current) => ({
      phase: "connecting",
      transcripts: [],
      error: null,
      summary: null,
      micDiagnostics: { ...current.micDiagnostics },
    }));

    try {

      const baseHttpUrl = trimTrailingSlash(VOICE_BACKEND_URL);
      console.log(`[VoiceCall] Creating call at ${baseHttpUrl}/api/calls`);

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${baseHttpUrl}/api/calls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ service_name: VOICE_SERVICE_NAME }),
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(responseText || `Call creation failed: ${response.status}`);
      }

      const call = parseJson<CreateCallResponse>(responseText);
      if (!call?.call_id) {
        throw new Error("Call creation returned invalid JSON");
      }
      console.log(`[VoiceCall] Call created: ${call.call_id}`);

      const baseWsUrl = `${toWebSocketBaseUrl(baseHttpUrl)}/`;
      const wsUrl = call.ws_url
        ? new URL(call.ws_url, baseWsUrl).toString()
        : `${baseWsUrl}ws/calls/${call.call_id}`;

      console.log(`[VoiceCall] Connecting WS: ${wsUrl}`);
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onerror = () => {
        if (phaseRef.current === "ended" || phaseRef.current === "error") return;
        setError("WebSocket connection error");
        cleanup();
      };

      socket.onclose = () => {
        if (phaseRef.current === "ended" || phaseRef.current === "error") return;
        cleanup({ closeWebSocket: false });
        setError("Voice session closed unexpectedly");
      };

      socket.onmessage = (event) => {
        const message = parseJson<any>(event.data);
        if (!message) return;
        void handleWsMessage(message);
      };
    } catch (error: any) {
      console.error("[VoiceCall] startCall error:", error);
      setError(error?.message || "Failed to start call");
      cleanup();
    }
  };

  const endCall = () => {
    // Snapshot transcripts BEFORE cleanup wipes them
    const finalSnapshot = transcriptsRef.current.filter((entry) => entry.final);
    lastFinalTranscriptsRef.current = finalSnapshot;

    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "end_call" }));
    }
    cleanup();
    setPhase("ended");
  };

  return {
    ...state,
    startCall,
    endCall,
    getFinalTranscripts: () =>
      lastFinalTranscriptsRef.current.length > 0
        ? lastFinalTranscriptsRef.current
        : transcriptsRef.current.filter((entry) => entry.final),
  };
}
