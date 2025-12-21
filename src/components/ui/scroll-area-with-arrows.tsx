import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ScrollAreaWithArrowsProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  scrollStep?: number;
  isTVMode?: boolean;
}

const ScrollAreaWithArrows = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaWithArrowsProps
>(({ className, children, scrollStep = 100, isTVMode = false, ...props }, ref) => {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = React.useState(false);
  const [canScrollDown, setCanScrollDown] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const { scrollTop, scrollHeight, clientHeight } = viewport;
    setCanScrollUp(scrollTop > 0);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1);
  }, []);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Initial check with delay for content to render
    updateScrollState();
    const initialTimer = setTimeout(updateScrollState, 100);
    const secondTimer = setTimeout(updateScrollState, 500);

    // Listen for scroll events
    viewport.addEventListener("scroll", updateScrollState);

    // Use ResizeObserver to detect content changes
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(viewport);

    // Use MutationObserver to detect when children are added/removed
    const mutationObserver = new MutationObserver(updateScrollState);
    mutationObserver.observe(viewport, { 
      childList: true, 
      subtree: true,
      attributes: true 
    });

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(secondTimer);
      viewport.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateScrollState]);

  const scrollUp = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ top: -scrollStep, behavior: "smooth" });
  };

  const scrollDown = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ top: scrollStep, behavior: "smooth" });
  };

  // Calculate button height based on TV mode
  const buttonHeight = isTVMode ? 56 : 32; // h-14 = 56px, h-8 = 32px

  return (
    <div className={cn("relative flex flex-col", className)} style={{ height: '100%' }}>
      {/* Up Arrow */}
      <Button
        variant="ghost"
        size="sm"
        onClick={scrollUp}
        disabled={!canScrollUp}
        className={cn(
          "w-full shrink-0 rounded-none border-b border-border flex items-center justify-center gap-2 transition-all",
          isTVMode 
            ? "h-14 text-lg bg-secondary/50 hover:bg-primary/20" 
            : "h-8",
          canScrollUp 
            ? "opacity-100" 
            : "opacity-40 cursor-not-allowed"
        )}
        aria-label="Scroll up"
      >
        <ChevronUp className={cn(isTVMode ? "h-7 w-7" : "h-4 w-4")} />
        <span className={cn(
          "text-muted-foreground",
          isTVMode ? "text-base font-medium" : "text-xs"
        )}>Scroll Up</span>
      </Button>

      {/* Scroll Area - takes remaining space */}
      <ScrollAreaPrimitive.Root
        ref={ref}
        className="relative overflow-hidden"
        style={{ flex: '1 1 0', minHeight: 0 }}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          className="h-full w-full rounded-[inherit] [&>div]:!block"
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>

      {/* Down Arrow */}
      <Button
        variant="ghost"
        size="sm"
        onClick={scrollDown}
        disabled={!canScrollDown}
        className={cn(
          "w-full shrink-0 rounded-none border-t border-border flex items-center justify-center gap-2 transition-all",
          isTVMode 
            ? "h-14 text-lg bg-secondary/50 hover:bg-primary/20" 
            : "h-8",
          canScrollDown 
            ? "opacity-100" 
            : "opacity-40 cursor-not-allowed"
        )}
        aria-label="Scroll down"
      >
        <ChevronDown className={cn(isTVMode ? "h-7 w-7" : "h-4 w-4")} />
        <span className={cn(
          "text-muted-foreground",
          isTVMode ? "text-base font-medium" : "text-xs"
        )}>Scroll Down</span>
      </Button>
    </div>
  );
});
ScrollAreaWithArrows.displayName = "ScrollAreaWithArrows";

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = "ScrollBar";

export { ScrollAreaWithArrows };
