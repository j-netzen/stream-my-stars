import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

interface MediaCardSkeletonProps {
  className?: string;
  showInfo?: boolean;
}

export function MediaCardSkeleton({ className, showInfo = true }: MediaCardSkeletonProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Poster skeleton with shimmer */}
      <Skeleton className="aspect-[2/3] rounded-lg" />
      
      {/* Info skeleton */}
      {showInfo && (
        <div className="space-y-2 p-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
    </div>
  );
}

interface MediaRowSkeletonProps {
  count?: number;
  className?: string;
}

export function MediaRowSkeleton({ count = 6, className }: MediaRowSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Row title skeleton */}
      <Skeleton className="h-6 w-40" />
      
      {/* Cards container */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <MediaCardSkeleton 
            key={i} 
            className="w-[140px] flex-shrink-0 md:w-[180px]" 
          />
        ))}
      </div>
    </div>
  );
}

interface HeroSkeletonProps {
  className?: string;
}

export function HeroSkeleton({ className }: HeroSkeletonProps) {
  return (
    <div className={cn(
      "relative h-[50vh] min-h-[320px] max-h-[500px] overflow-hidden",
      className
    )}>
      {/* Background */}
      <Skeleton className="absolute inset-0" />
      
      {/* Content overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      
      {/* Content skeleton */}
      <div className="relative z-10 h-full flex flex-col justify-end pb-8 px-6">
        <div className="max-w-xl space-y-4">
          {/* Badges */}
          <div className="flex gap-3">
            <Skeleton className="h-6 w-16 rounded" />
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-14" />
          </div>
          
          {/* Title */}
          <Skeleton className="h-10 w-3/4" />
          
          {/* Description */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          
          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-12 w-24 rounded-lg" />
            <Skeleton className="h-12 w-28 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface StreamCardSkeletonProps {
  className?: string;
}

export function StreamCardSkeleton({ className }: StreamCardSkeletonProps) {
  return (
    <div className={cn(
      "p-4 rounded-lg border border-border bg-card/50",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-16 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-16 rounded" />
      </div>
      <div className="mt-2 flex gap-2">
        <Skeleton className="h-5 w-12 rounded" />
        <Skeleton className="h-5 w-14 rounded" />
        <Skeleton className="h-5 w-10 rounded" />
      </div>
    </div>
  );
}

interface PageSkeletonProps {
  rows?: number;
}

export function PageSkeleton({ rows = 3 }: PageSkeletonProps) {
  return (
    <div className="min-h-screen space-y-8 pb-8">
      <HeroSkeleton />
      
      <div className="px-6 space-y-8">
        {Array.from({ length: rows }).map((_, i) => (
          <MediaRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default MediaCardSkeleton;
