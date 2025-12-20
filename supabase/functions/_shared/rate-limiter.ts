// Simple in-memory rate limiter for edge functions
// Uses a sliding window approach with IP-based tracking

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store - note: this resets when the edge function cold starts
// For production, consider using Supabase or Redis for persistence
const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxRequests: number;    // Maximum requests allowed in the window
  windowMs: number;       // Time window in milliseconds
  identifier?: string;    // Optional custom identifier (defaults to IP)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
}

// Clean up expired entries periodically
function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

// Get client IP from request headers
export function getClientIp(req: Request): string {
  // Check common proxy headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  // Fallback to a generic identifier
  return "unknown";
}

export function checkRateLimit(
  req: Request,
  config: RateLimitConfig
): RateLimitResult {
  const { maxRequests, windowMs, identifier } = config;
  const now = Date.now();
  
  // Clean up expired entries occasionally
  if (Math.random() < 0.1) {
    cleanupExpired();
  }
  
  // Get or create identifier
  const ip = identifier || getClientIp(req);
  const key = `ratelimit:${ip}`;
  
  // Get existing entry or create new one
  let entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetAt <= now) {
    // Create new window
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
  }
  
  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);
  
  const remaining = Math.max(0, maxRequests - entry.count);
  const allowed = entry.count <= maxRequests;
  
  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
    retryAfterMs: allowed ? undefined : entry.resetAt - now,
  };
}

export function createRateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      retryAfterMs: result.retryAfterMs,
      message: `Too many requests. Please try again in ${Math.ceil((result.retryAfterMs || 0) / 1000)} seconds.`,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((result.retryAfterMs || 0) / 1000)),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetAt),
      },
    }
  );
}
