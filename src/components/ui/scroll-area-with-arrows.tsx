import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ScrollAreaWithArrowsProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  scrollStep?: number;
}

const ScrollAreaWithArrows = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaWithArrowsProps
>(({ className, children, scrollStep = 100, ...props }, ref) => {
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

    // Initial check
    updateScrollState();

    // Listen for scroll events
    viewport.addEventListener("scroll", updateScrollState);

    // Use ResizeObserver to detect content changes
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
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

  return (
    <div className="relative flex flex-col">
      {/* Up Arrow */}
      <Button
        variant="ghost"
        size="sm"
        onClick={scrollUp}
        disabled={!canScrollUp}
        className={cn(
          "h-8 w-full rounded-none border-b border-border flex items-center justify-center gap-2 transition-opacity",
          canScrollUp ? "opacity-100" : "opacity-40 cursor-not-allowed"
        )}
        aria-label="Scroll up"
      >
        <ChevronUp className="h-4 w-4" />
        <span className="text-xs text-muted-foreground">Scroll Up</span>
      </Button>

      {/* Scroll Area */}
      <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn("relative overflow-hidden flex-1", className)}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          className="h-full w-full rounded-[inherit]"
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
          "h-8 w-full rounded-none border-t border-border flex items-center justify-center gap-2 transition-opacity",
          canScrollDown ? "opacity-100" : "opacity-40 cursor-not-allowed"
        )}
        aria-label="Scroll down"
      >
        <ChevronDown className="h-4 w-4" />
        <span className="text-xs text-muted-foreground">Scroll Down</span>
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
