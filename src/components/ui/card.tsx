import * as React from "react";

import { cn } from "@/lib/utils";
import spaceBg from "@/assets/space-sidebar-bg.jpg";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { withSpaceBg?: boolean }
>(({ className, withSpaceBg = false, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border border-border/50 text-card-foreground shadow-star-md overflow-hidden transition-all duration-300 hover:shadow-star-lg",
      withSpaceBg ? "relative" : "bg-card",
      className
    )}
    {...props}
  >
    {withSpaceBg && (
      <>
        {/* Space Background */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-15 dark:opacity-25"
          style={{ backgroundImage: `url(${spaceBg})` }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-card/95 via-card/90 to-card/95" />
      </>
    )}
    {withSpaceBg ? <div className="relative z-10">{children}</div> : children}
  </div>
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
