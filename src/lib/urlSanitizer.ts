/**
 * URL Sanitizer for Live TV Channels
 * 
 * Strips sensitive query parameters (tokens, auth keys, API keys) from URLs
 * to prevent accidental credential storage in the database.
 */

// List of query parameter names that typically contain sensitive credentials
const SENSITIVE_PARAMS = [
  'token',
  'key',
  'apikey',
  'api_key',
  'auth',
  'auth_token',
  'access_token',
  'secret',
  'password',
  'pwd',
  'pass',
  'credential',
  'credentials',
  'bearer',
  'jwt',
  'session',
  'sessionid',
  'session_id',
];

/**
 * Check if a query parameter name is considered sensitive
 */
function isSensitiveParam(paramName: string): boolean {
  const lowerName = paramName.toLowerCase();
  return SENSITIVE_PARAMS.some(sensitive => 
    lowerName === sensitive || 
    lowerName.includes(sensitive) ||
    lowerName.endsWith('_token') ||
    lowerName.endsWith('_key') ||
    lowerName.endsWith('_auth')
  );
}

/**
 * Sanitize a URL by removing sensitive query parameters
 * Returns the sanitized URL string
 */
export function sanitizeUrl(url: string): string {
  if (!url) return url;
  
  try {
    const urlObj = new URL(url);
    const paramsToDelete: string[] = [];
    
    // Identify sensitive parameters
    urlObj.searchParams.forEach((_, key) => {
      if (isSensitiveParam(key)) {
        paramsToDelete.push(key);
      }
    });
    
    // Remove sensitive parameters
    paramsToDelete.forEach(key => {
      urlObj.searchParams.delete(key);
    });
    
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return the original URL
    return url;
  }
}

/**
 * Check if a URL contains sensitive query parameters
 * Returns true if any sensitive params are found
 */
export function hasSensitiveParams(url: string): boolean {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    let found = false;
    
    urlObj.searchParams.forEach((_, key) => {
      if (isSensitiveParam(key)) {
        found = true;
      }
    });
    
    return found;
  } catch {
    return false;
  }
}

/**
 * Get list of sensitive parameter names found in URL
 */
export function getSensitiveParamNames(url: string): string[] {
  if (!url) return [];
  
  try {
    const urlObj = new URL(url);
    const sensitiveKeys: string[] = [];
    
    urlObj.searchParams.forEach((_, key) => {
      if (isSensitiveParam(key)) {
        sensitiveKeys.push(key);
      }
    });
    
    return sensitiveKeys;
  } catch {
    return [];
  }
}
