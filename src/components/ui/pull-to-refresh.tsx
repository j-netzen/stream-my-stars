import { ReactNode, forwardRef } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void> | void;
  className?: string;
  threshold?: number;
}

export const PullToRefresh = forwardRef<HTMLDivElement, PullToRefreshProps>(
  ({ children, onRefresh, className, threshold = 80 }, ref) => {
    const {
      containerRef,
      pullDistance,
      isRefreshing,
      progress,
      shouldTrigger,
      handlers,
    } = usePullToRefresh({ onRefresh, threshold });

    return (
      <div
        ref={(node) => {
          // Handle both refs
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={cn("relative overflow-auto", className)}
        {...handlers}
      >
        {/* Pull indicator */}
        <div
          className={cn(
            "absolute left-0 right-0 flex items-center justify-center transition-opacity z-50 pointer-events-none",
            pullDistance > 0 || isRefreshing ? "opacity-100" : "opacity-0"
          )}
          style={{
            top: 'var(--safe-area-inset-top, 0px)',
            height: `${Math.max(pullDistance, isRefreshing ? threshold : 0)}px`,
          }}
        >
          <div
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/20 transition-all",
              shouldTrigger && !isRefreshing && "bg-primary/20 scale-110",
              isRefreshing && "bg-primary/20"
            )}
            style={{
              transform: `rotate(${progress * 180}deg)`,
            }}
          >
            {isRefreshing ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : (
              <ArrowDown
                className={cn(
                  "w-5 h-5 text-primary transition-transform",
                  shouldTrigger && "rotate-180"
                )}
              />
            )}
          </div>
        </div>

        {/* Content with pull transform */}
        <div
          className="transition-transform will-change-transform"
          style={{
            transform: pullDistance > 0 || isRefreshing 
              ? `translateY(${Math.max(pullDistance, isRefreshing ? threshold : 0)}px)` 
              : undefined,
            transitionDuration: isRefreshing || pullDistance === 0 ? "200ms" : "0ms",
          }}
        >
          {children}
        </div>
      </div>
    );
  }
);

PullToRefresh.displayName = "PullToRefresh";