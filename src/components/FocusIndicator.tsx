import { useFocusIndicator } from "@/hooks/useRemoteNavigation";
import { useTVMode } from "@/hooks/useTVMode";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, CornerDownLeft } from "lucide-react";

export function FocusIndicator() {
  const focusedInfo = useFocusIndicator();
  const { isTVMode } = useTVMode();

  if (!focusedInfo) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "bg-background/95 backdrop-blur-md border border-border rounded-xl shadow-2xl",
        "animate-in fade-in slide-in-from-bottom-4 duration-200",
        isTVMode ? "px-8 py-5" : "px-6 py-4"
      )}
    >
      <div className="flex items-center gap-6">
        {/* Currently focused item */}
        <div className="flex flex-col">
          <span className={cn(
            "font-semibold text-foreground",
            isTVMode ? "text-xl" : "text-base"
          )}>
            {focusedInfo.label}
          </span>
          <span className={cn(
            "text-muted-foreground",
            isTVMode ? "text-base" : "text-sm"
          )}>
            {focusedInfo.hint}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-10 bg-border" />

        {/* Navigation hints */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-0.5">
              <kbd className={cn(
                "inline-flex items-center justify-center rounded bg-muted border border-border",
                isTVMode ? "w-8 h-8" : "w-6 h-6"
              )}>
                <ArrowUp className={cn(isTVMode ? "w-4 h-4" : "w-3 h-3")} />
              </kbd>
              <div className="flex gap-0.5">
                <kbd className={cn(
                  "inline-flex items-center justify-center rounded bg-muted border border-border",
                  isTVMode ? "w-8 h-8" : "w-6 h-6"
                )}>
                  <ArrowLeft className={cn(isTVMode ? "w-4 h-4" : "w-3 h-3")} />
                </kbd>
                <kbd className={cn(
                  "inline-flex items-center justify-center rounded bg-muted border border-border",
                  isTVMode ? "w-8 h-8" : "w-6 h-6"
                )}>
                  <ArrowDown className={cn(isTVMode ? "w-4 h-4" : "w-3 h-3")} />
                </kbd>
                <kbd className={cn(
                  "inline-flex items-center justify-center rounded bg-muted border border-border",
                  isTVMode ? "w-8 h-8" : "w-6 h-6"
                )}>
                  <ArrowRight className={cn(isTVMode ? "w-4 h-4" : "w-3 h-3")} />
                </kbd>
              </div>
            </div>
            <span className={cn("text-muted-foreground ml-1", isTVMode ? "text-sm" : "text-xs")}>
              Navigate
            </span>
          </div>

          <div className="flex items-center gap-1">
            <kbd className={cn(
              "inline-flex items-center justify-center rounded bg-primary text-primary-foreground font-medium",
              isTVMode ? "px-3 h-8 text-sm" : "px-2 h-6 text-xs"
            )}>
              <CornerDownLeft className={cn("mr-1", isTVMode ? "w-4 h-4" : "w-3 h-3")} />
              Enter
            </kbd>
            <span className={cn("text-muted-foreground ml-1", isTVMode ? "text-sm" : "text-xs")}>
              Select
            </span>
          </div>

          <div className="flex items-center gap-1">
            <kbd className={cn(
              "inline-flex items-center justify-center rounded bg-muted border border-border font-medium",
              isTVMode ? "px-3 h-8 text-sm" : "px-2 h-6 text-xs"
            )}>
              Esc
            </kbd>
            <span className={cn("text-muted-foreground ml-1", isTVMode ? "text-sm" : "text-xs")}>
              Back
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
