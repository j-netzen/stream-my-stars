import { cn } from "@/lib/utils";
import { Check, Loader2, Search, Database, Magnet, Play } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export type ResolutionStep = "finding" | "caching" | "resolving" | "starting" | "complete";

interface StreamResolutionOverlayProps {
  isVisible: boolean;
  currentStep: ResolutionStep;
  progress: number;
  statusMessage?: string;
}

const steps: { id: ResolutionStep; label: string; icon: React.ReactNode }[] = [
  { id: "finding", label: "Finding streams", icon: <Search className="w-4 h-4" /> },
  { id: "caching", label: "Checking cache", icon: <Database className="w-4 h-4" /> },
  { id: "resolving", label: "Resolving magnet", icon: <Magnet className="w-4 h-4" /> },
  { id: "starting", label: "Starting playback", icon: <Play className="w-4 h-4" /> },
];

const getStepIndex = (step: ResolutionStep): number => {
  const idx = steps.findIndex((s) => s.id === step);
  return idx === -1 ? 0 : idx;
};

export function StreamResolutionOverlay({
  isVisible,
  currentStep,
  progress,
  statusMessage,
}: StreamResolutionOverlayProps) {
  if (!isVisible) return null;

  const currentIndex = getStepIndex(currentStep);
  const isComplete = currentStep === "complete";

  return (
    <div className="space-y-4 p-4 bg-secondary/50 backdrop-blur-sm rounded-lg border border-border animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Step indicators */}
      <div className="flex items-center justify-between gap-2">
        {steps.map((step, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex && !isComplete;
          const isCompleteStep = isComplete && index <= currentIndex;

          return (
            <div key={step.id} className="flex-1 flex flex-col items-center gap-1.5">
              {/* Step circle */}
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500",
                  isPast || isCompleteStep
                    ? "bg-green-500/20 text-green-500 border-2 border-green-500/50"
                    : isCurrent
                    ? "bg-primary/20 text-primary border-2 border-primary animate-pulse"
                    : "bg-muted text-muted-foreground border-2 border-muted-foreground/30"
                )}
              >
                {isPast || isCompleteStep ? (
                  <Check className="w-4 h-4" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  step.icon
                )}
              </div>

              {/* Step label */}
              <span
                className={cn(
                  "text-[10px] font-medium text-center leading-tight transition-colors duration-300",
                  isPast || isCompleteStep
                    ? "text-green-500"
                    : isCurrent
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Connecting lines */}
      <div className="relative px-8 -mt-12 mb-4">
        <div className="absolute top-5 left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] h-0.5 bg-muted-foreground/20" />
        <div
          className="absolute top-5 left-[calc(12.5%+20px)] h-0.5 bg-green-500 transition-all duration-500"
          style={{
            width: `${Math.min(100, (currentIndex / (steps.length - 1)) * 100)}%`,
            maxWidth: `calc(100% - ${(100 / steps.length) * 2}%)`,
          }}
        />
      </div>

      {/* Progress bar */}
      {progress > 0 && progress < 100 && (
        <div className="space-y-1.5">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{statusMessage || "Processing..."}</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {/* Status message (when no progress bar) */}
      {(progress === 0 || progress >= 100) && statusMessage && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
}
