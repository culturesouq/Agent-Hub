import { useState, useRef, useCallback, useEffect } from "react";

export type VoiceState = "idle" | "recording" | "transcribing" | "speaking";

interface UseVoiceSessionOptions {
  agentId: number;
  voice?: string;
  voiceSpeed?: number;
  onTranscript?: (text: string) => void;
  onError?: (err: string) => void;
}

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 1800;
const MIN_RECORDING_MS = 600;

export function useVoiceSession({ agentId, voice = "nova", voiceSpeed = 1.0, onTranscript, onError }: UseVoiceSessionOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isActive, setIsActive] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isRecordingRef = useRef(false);

  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyser = audioContextRef.current.createAnalyser();
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
      isRecordingRef.current = true;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        isRecordingRef.current = false;
        const duration = Date.now() - recordingStartRef.current;
        if (duration < MIN_RECORDING_MS || audioChunksRef.current.length === 0) {
          setVoiceState("recording");
          startRecording();
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        await transcribeAndProcess(audioBlob);
      };

      recorder.start(250);
      setVoiceState("recording");

      detectSilence();
    } catch (err: any) {
      onError?.(err.message || "Microphone access denied");
      setIsActive(false);
      setVoiceState("idle");
    }
  }, [agentId, voice, voiceSpeed]);

  const detectSilence = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !isRecordingRef.current) return;

    const data = new Float32Array(analyser.fftSize);

    const check = () => {
      if (!isRecordingRef.current) return;
      analyser.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);

      if (rms < SILENCE_THRESHOLD) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          }, SILENCE_DURATION_MS);
        }
      } else {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }, []);

  const transcribeAndProcess = useCallback(async (audioBlob: Blob) => {
    setVoiceState("transcribing");
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const res = await fetch(`/api/agents/${agentId}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Transcription failed");
      const { text } = await res.json() as { text: string };

      if (text.trim()) {
        onTranscript?.(text.trim());
      } else {
        setVoiceState("idle");
        if (isActive) {
          setTimeout(() => startRecording(), 300);
        }
      }
    } catch (err: any) {
      onError?.(err.message || "Transcription failed");
      setVoiceState("idle");
    }
  }, [agentId, isActive, onTranscript, onError, startRecording]);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setVoiceState("speaking");
    stopCurrentAudio();
    try {
      const res = await fetch(`/api/agents/${agentId}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, speed: voiceSpeed }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const { audio } = await res.json() as { audio: string };

      const binaryStr = atob(audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      const audioEl = new Audio(url);
      currentAudioRef.current = audioEl;

      audioEl.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        if (isActive) {
          setVoiceState("recording");
          startRecording();
        } else {
          setVoiceState("idle");
        }
      };

      audioEl.onerror = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        setVoiceState("idle");
      };

      await audioEl.play();
    } catch (err: any) {
      onError?.(err.message || "TTS failed");
      setVoiceState("idle");
      if (isActive) {
        setTimeout(() => startRecording(), 300);
      }
    }
  }, [agentId, voice, voiceSpeed, isActive, stopCurrentAudio, startRecording]);

  const stopMic = useCallback(() => {
    isRecordingRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const startSession = useCallback(async () => {
    setIsActive(true);
    await startRecording();
  }, [startRecording]);

  const stopSession = useCallback(() => {
    setIsActive(false);
    stopMic();
    stopCurrentAudio();
    setVoiceState("idle");
  }, [stopMic, stopCurrentAudio]);

  useEffect(() => {
    return () => {
      stopMic();
      stopCurrentAudio();
    };
  }, []);

  return { voiceState, isActive, startSession, stopSession, speak };
}
