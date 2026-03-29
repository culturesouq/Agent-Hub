import { MicOff, RefreshCw } from "lucide-react";

interface MicPermissionGuideProps {
  onRetry: () => void;
  onDismiss: () => void;
}

export function MicPermissionGuide({ onRetry, onDismiss }: MicPermissionGuideProps) {
  const isChrome = navigator.userAgent.includes("Chrome");
  const isFirefox = navigator.userAgent.includes("Firefox");
  const isSafari = !isChrome && navigator.userAgent.includes("Safari");

  const steps = isChrome
    ? [
        "Click the lock icon (🔒) in the browser address bar",
        'Find "Microphone" and change it to "Allow"',
        "Reload the page if prompted, then try again",
      ]
    : isFirefox
    ? [
        "Click the microphone icon in the address bar",
        'Select "Allow" for microphone access',
        "Try again below",
      ]
    : isSafari
    ? [
        'Go to Safari → Settings for This Website',
        'Set "Microphone" to "Allow"',
        "Reload and try again",
      ]
    : [
        "Open your browser settings and allow microphone access for this site",
        "Reload the page and try again",
      ];

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#060a10]/96 backdrop-blur-sm rounded-2xl px-8">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-400/20 flex items-center justify-center mb-5">
        <MicOff className="w-7 h-7 text-red-400" />
      </div>

      <h3 className="text-base font-bold text-white mb-1.5">Microphone Access Blocked</h3>
      <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed max-w-xs">
        Voice chat needs microphone permission. Follow these steps to enable it:
      </p>

      <ol className="w-full max-w-xs space-y-2.5 mb-7">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-[10px] text-primary font-bold mt-0.5">
              {i + 1}
            </span>
            <span className="text-sm text-white/80 leading-snug">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={onRetry}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-all text-sm font-semibold"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
        <button
          onClick={onDismiss}
          className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-muted-foreground hover:text-white hover:border-white/20 transition-all text-sm"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
