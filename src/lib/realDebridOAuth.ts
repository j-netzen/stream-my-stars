// Real-Debrid OAuth2 Device Flow Implementation
// Uses edge function proxy to avoid CORS issues

import { supabase } from "@/integrations/supabase/client";

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: "rd_access_token",
  REFRESH_TOKEN: "rd_refresh_token",
  CLIENT_ID: "rd_client_id",
  CLIENT_SECRET: "rd_client_secret",
  TOKEN_EXPIRY: "rd_token_expiry",
} as const;

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  interval: number;
  expires_in: number;
  verification_url: string;
  direct_verification_url: string;
}

export interface DeviceCredentialsResponse {
  client_id: string;
  client_secret: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token: string;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  expiresAt: number;
}

export type PairingStatus =
  | "idle"
  | "requesting_code"
  | "awaiting_authorization"
  | "exchanging_tokens"
  | "success"
  | "error"
  | "expired"
  | "cancelled";

export interface PairingState {
  status: PairingStatus;
  userCode?: string;
  verificationUrl?: string;
  error?: string;
  deviceCode?: string;
  interval?: number;
}

/**
 * Phase 1: Request a device code from Real-Debrid
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const { data, error } = await supabase.functions.invoke("real-debrid-oauth", {
    body: { action: "device_code" },
  });

  if (error) {
    throw new Error(`Failed to request device code: ${error.message}`);
  }

  if (data.error) {
    throw new Error(`Failed to request device code: ${data.error}`);
  }

  return data as DeviceCodeResponse;
}

/**
 * Phase 3: Poll for device credentials after user authorizes
 * Returns credentials when user completes authorization
 * Throws specific errors for different states
 */
export async function pollDeviceCredentials(deviceCode: string): Promise<DeviceCredentialsResponse> {
  const { data, error } = await supabase.functions.invoke("real-debrid-oauth", {
    body: { action: "credentials", device_code: deviceCode },
  });

  if (error) {
    throw new Error(`Credentials request failed: ${error.message}`);
  }

  // Handle specific error codes based on response
  if (data.error_code === 18 || data.error === "action_pending") {
    throw new PendingAuthorizationError("Authorization pending");
  }

  if (data.error_code === 6 || data.error === "code_expired") {
    throw new ExpiredCodeError("Device code has expired");
  }

  if (data.error_code === 7 || data.error === "code_used") {
    throw new UsedCodeError("Device code has already been used");
  }

  if (data.error) {
    throw new Error(`Credentials request failed: ${data.error}`);
  }

  return data as DeviceCredentialsResponse;
}

/**
 * Phase 4: Exchange client credentials for access and refresh tokens
 */
export async function exchangeForTokens(
  clientId: string,
  clientSecret: string,
  deviceCode: string
): Promise<TokenResponse> {
  const { data, error } = await supabase.functions.invoke("real-debrid-oauth", {
    body: {
      action: "token",
      client_id: clientId,
      client_secret: clientSecret,
      device_code: deviceCode,
    },
  });

  if (error) {
    throw new Error(`Token exchange failed: ${error.message}`);
  }

  if (data.error) {
    throw new Error(`Token exchange failed: ${data.error}`);
  }

  return data as TokenResponse;
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<TokenResponse> {
  const { data, error } = await supabase.functions.invoke("real-debrid-oauth", {
    body: {
      action: "refresh",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    },
  });

  if (error) {
    throw new Error(`Token refresh failed: ${error.message}`);
  }

  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error}`);
  }

  return data as TokenResponse;
}

// Custom error classes for specific error handling
export class PendingAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PendingAuthorizationError";
  }
}

export class ExpiredCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpiredCodeError";
  }
}

export class UsedCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsedCodeError";
  }
}

// Token storage functions
export function storeTokens(
  tokens: TokenResponse,
  clientId: string,
  clientSecret: string
): void {
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
  localStorage.setItem(STORAGE_KEYS.CLIENT_ID, clientId);
  localStorage.setItem(STORAGE_KEYS.CLIENT_SECRET, clientSecret);
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiresAt.toString());
  
  // Also store as legacy key for backward compatibility
  localStorage.setItem("realDebridApiKey", tokens.access_token);
}

export function getStoredTokens(): StoredTokens | null {
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  const clientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  const clientSecret = localStorage.getItem(STORAGE_KEYS.CLIENT_SECRET);
  const expiresAt = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);

  if (!accessToken || !refreshToken || !clientId || !clientSecret || !expiresAt) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    expiresAt: parseInt(expiresAt, 10),
  };
}

export function clearStoredTokens(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.CLIENT_ID);
  localStorage.removeItem(STORAGE_KEYS.CLIENT_SECRET);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  localStorage.removeItem("realDebridApiKey");
}

export function isTokenExpired(): boolean {
  const tokens = getStoredTokens();
  if (!tokens) return true;
  
  // Consider token expired if less than 5 minutes remaining
  return Date.now() > tokens.expiresAt - 5 * 60 * 1000;
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  if (!isTokenExpired()) {
    return tokens.accessToken;
  }

  // Token is expired, try to refresh
  try {
    const newTokens = await refreshAccessToken(
      tokens.clientId,
      tokens.clientSecret,
      tokens.refreshToken
    );
    storeTokens(newTokens, tokens.clientId, tokens.clientSecret);
    return newTokens.access_token;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    clearStoredTokens();
    return null;
  }
}

/**
 * Check if user has stored OAuth tokens
 */
export function hasOAuthTokens(): boolean {
  return getStoredTokens() !== null;
}
