import { useState, useRef, useCallback, useEffect } from "react";

export type VoiceState = "idle" | "recording" | "transcribing" | "speaking";

interface UseVoiceSessionOptions {
  agentId: number;
  voice?: string;
  voiceSpeed?: number;
  onTranscript?: (text: string) => void;
  onError?: (err: string) => void;
  onMicDenied?: () => void;
}

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 1800;
const MIN_RECORDING_MS = 600;
const TTS_SAMPLE_RATE = 24000;

export function useVoiceSession({
  agentId,
  voice = "nova",
  voiceSpeed = 1.0,
  onTranscript,
  onError,
}: UseVoiceSessionOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isActive, setIsActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [micDenied, setMicDenied] = useState(false);

  const isActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);

  const stopCurrentAudio = useCallback(() => {
    speakAbortRef.current?.abort();
    speakAbortRef.current = null;
    try { currentSourceRef.current?.stop(); } catch (_) {}
    currentSourceRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (!isActiveRef.current) return;

    // Always tear down any previous mic/context resources before starting a new turn.
    // This prevents tracks from leaking across silence→onstop→restart cycles.
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isActiveRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingStartRef.current = Date.now();

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const duration = Date.now() - recordingStartRef.current;
        if (!isActiveRef.current || duration < MIN_RECORDING_MS || audioChunksRef.current.length === 0) {
          if (isActiveRef.current) startRecording();
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        await transcribeAudio(blob);
      };

      recorder.start(250);
      setVoiceState("recording");
      detectSilence();
    } catch (err: any) {
      if (isActiveRef.current) {
        isActiveRef.current = false;
        setIsActive(false);
        setVoiceState("idle");
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setMicDenied(true);
        } else {
          onError?.(err.message || "Microphone access denied");
        }
      }
    }
  }, [agentId]);

  const detectSilence = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Float32Array(analyser.fftSize);
    const check = () => {
      if (!isActiveRef.current || mediaRecorderRef.current?.state !== "recording") return;
      analyser.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      if (rms < SILENCE_THRESHOLD) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
          }, SILENCE_DURATION_MS);
        }
      } else {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }, []);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    if (!isActiveRef.current) return;
    setVoiceState("transcribing");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch(`/api/agents/${agentId}/transcribe`, { method: "POST", body: formData });
      if (!isActiveRef.current) return;
      if (!res.ok) throw new Error("Transcription failed");
      const { text } = await res.json() as { text: string };
      if (!isActiveRef.current) return;
      if (text.trim()) {
        setTranscript(text.trim());
        onTranscript?.(text.trim());
      } else {
        setVoiceState("recording");
        startRecording();
      }
    } catch (err: any) {
      if (!isActiveRef.current) return;
      onError?.(err.message || "Transcription failed");
      setVoiceState("recording");
      startRecording();
    }
  }, [agentId, onTranscript, onError, startRecording]);

  const speak = useCallback(async (text: string) => {
    if (!text.trim() || !isActiveRef.current) return;
    setVoiceState("speaking");
    stopCurrentAudio();

    speakAbortRef.current = new AbortController();
    const { signal } = speakAbortRef.current;

    try {
      const res = await fetch(`/api/agents/${agentId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, speed: voiceSpeed }),
        signal,
      });

      if (!res.ok || !res.body) throw new Error("TTS failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const pcm16Parts: Int16Array[] = [];
      let nextPlayTime = 0;
      let playbackCtx: AudioContext | null = null;

      const getCtx = () => {
        if (!playbackCtx || playbackCtx.state === "closed") {
          playbackCtx = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
          nextPlayTime = playbackCtx.currentTime;
        }
        return playbackCtx;
      };

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let parsed: { chunk?: string; done?: boolean; error?: string };
          try { parsed = JSON.parse(line.substring(6)); } catch { continue; }
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.done) break outer;
          if (parsed.chunk) {
            const bStr = atob(parsed.chunk);
            const bytes = new Uint8Array(bStr.length);
            for (let i = 0; i < bStr.length; i++) bytes[i] = bStr.charCodeAt(i);
            const int16 = new Int16Array(bytes.buffer);
            pcm16Parts.push(int16);

            if (signal.aborted) break outer;

            const ctx = getCtx();
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
            const audioBuf = ctx.createBuffer(1, float32.length, TTS_SAMPLE_RATE);
            audioBuf.copyToChannel(float32, 0);
            const src = ctx.createBufferSource();
            src.buffer = audioBuf;
            src.connect(ctx.destination);
            const startAt = Math.max(nextPlayTime, ctx.currentTime + 0.04);
            src.start(startAt);
            nextPlayTime = startAt + audioBuf.duration;
            currentSourceRef.current = src;
          }
        }
      }

      if (signal.aborted) return;

      const bufferDuration = pcm16Parts.reduce((s, p) => s + p.length, 0) / TTS_SAMPLE_RATE;
      const ctx = playbackCtx;
      if (ctx && bufferDuration > 0) {
        const remaining = (nextPlayTime - ctx.currentTime) * 1000;
        await new Promise<void>(resolve => setTimeout(resolve, Math.max(0, remaining + 200)));
      }

      if (!isActiveRef.current) return;
      setTranscript("");
      setVoiceState("recording");
      startRecording();
    } catch (err: any) {
      if (signal?.aborted || !isActiveRef.current) return;
      onError?.(err.message || "TTS failed");
      setVoiceState("recording");
      startRecording();
    }
  }, [agentId, voice, voiceSpeed, stopCurrentAudio, onError, startRecording]);

  const stopMic = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const startSession = useCallback(async () => {
    setMicDenied(false);
    isActiveRef.current = true;
    setIsActive(true);
    setTranscript("");
    await startRecording();
  }, [startRecording]);

  const retrySession = useCallback(async () => {
    setMicDenied(false);
    isActiveRef.current = true;
    setIsActive(true);
    setTranscript("");
    await startRecording();
  }, [startRecording]);

  const clearMicDenied = useCallback(() => {
    setMicDenied(false);
  }, []);

  const stopSession = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
    setVoiceState("idle");
    setTranscript("");
    setMicDenied(false);
    stopMic();
    stopCurrentAudio();
  }, [stopMic, stopCurrentAudio]);

  useEffect(() => () => {
    isActiveRef.current = false;
    stopMic();
    stopCurrentAudio();
  }, []);

  return { voiceState, isActive, micDenied, transcript, startSession, stopSession, retrySession, clearMicDenied, speak };
}
