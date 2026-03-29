import { useI18n } from "@/lib/i18n";
import { type VoiceState } from "@/hooks/use-voice-session";
import { Mic, Volume2, Loader2, MicOff } from "lucide-react";

interface VoiceOverlayProps {
  agentName: string;
  voiceState: VoiceState;
  transcript: string;
  onStop: () => void;
}

export function VoiceOverlay({ agentName, voiceState, transcript, onStop }: VoiceOverlayProps) {
  const { t } = useI18n();

  const stateConfig = {
    recording: {
      icon: <Mic className="w-10 h-10 text-red-400" />,
      ring: "border-red-400/40",
      pulse: "bg-red-400/15",
      label: t('voiceRecording'),
      labelColor: "text-red-400",
    },
    transcribing: {
      icon: <Loader2 className="w-10 h-10 text-primary animate-spin" />,
      ring: "border-primary/40",
      pulse: "bg-primary/15",
      label: t('voiceTranscribing'),
      labelColor: "text-primary",
    },
    speaking: {
      icon: <Volume2 className="w-10 h-10 text-green-400" />,
      ring: "border-green-400/40",
      pulse: "bg-green-400/15",
      label: t('voiceSpeaking'),
      labelColor: "text-green-400",
    },
    idle: {
      icon: <Mic className="w-10 h-10 text-muted-foreground" />,
      ring: "border-white/10",
      pulse: "bg-white/5",
      label: "...",
      labelColor: "text-muted-foreground",
    },
  };

  const cfg = stateConfig[voiceState];
  const isListening = voiceState === "recording";
  const isSpeaking = voiceState === "speaking";

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#060a10]/95 backdrop-blur-sm rounded-2xl">
      {/* Animated outer rings */}
      <div className="relative flex items-center justify-center mb-8">
        {(isListening || isSpeaking) && (
          <>
            <span className={`absolute w-40 h-40 rounded-full border ${cfg.ring} animate-ping opacity-20`} />
            <span className={`absolute w-28 h-28 rounded-full border ${cfg.ring} animate-ping opacity-30 [animation-delay:300ms]`} />
          </>
        )}
        <div className={`relative w-20 h-20 rounded-full ${cfg.pulse} border ${cfg.ring} flex items-center justify-center transition-all`}>
          {cfg.icon}
        </div>
      </div>

      {/* Agent name */}
      <p className="text-xs font-mono text-muted-foreground/60 mb-1 uppercase tracking-widest">
        {agentName}
      </p>

      {/* State label */}
      <p className={`text-base font-semibold ${cfg.labelColor} mb-6 transition-all`}>
        {cfg.label}
      </p>

      {/* Transcript preview */}
      {transcript && (
        <div className="mx-8 mb-6 px-4 py-3 rounded-xl bg-white/5 border border-white/8 max-w-sm text-center">
          <p className="text-sm text-white/80 leading-relaxed">{transcript}</p>
        </div>
      )}

      {/* Sound wave animation when recording */}
      {isListening && (
        <div className="flex items-end gap-1 h-8 mb-6">
          {[...Array(7)].map((_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-red-400/60 animate-bounce"
              style={{
                height: `${Math.random() * 18 + 6}px`,
                animationDelay: `${i * 80}ms`,
                animationDuration: `${600 + i * 50}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Speaking wave animation */}
      {isSpeaking && (
        <div className="flex items-end gap-1 h-8 mb-6">
          {[...Array(9)].map((_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-green-400/60 animate-bounce"
              style={{
                height: `${Math.random() * 22 + 4}px`,
                animationDelay: `${i * 60}ms`,
                animationDuration: `${500 + i * 40}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Stop button */}
      <button
        onClick={onStop}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-500/20 border border-red-400/30 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all font-semibold text-sm"
      >
        <MicOff className="w-4 h-4" />
        {t('stopVoice')}
      </button>

      <p className="mt-4 text-[10px] text-muted-foreground/40 font-mono">
        VOICE CHAT ACTIVE — speak naturally, pause to send
      </p>
    </div>
  );
}
