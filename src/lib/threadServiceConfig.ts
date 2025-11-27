/**
 * Centralized configuration for thread service URL
 * Provides consistent fallback strategy and validation
 */

/**
 * Get the thread service base URL with consistent fallback
 * @returns The thread service URL without trailing slash, or null if not configured
 */
export function getThreadServiceBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_THREAD_SERVICE_URL?.replace(/\/$/, "");
  return url || null;
}

/**
 * Get the thread service base URL with a default fallback
 * @param defaultUrl - Default URL to use if not configured (default: http://localhost:8080)
 * @returns The thread service URL without trailing slash
 */
export function getThreadServiceBaseUrlWithFallback(defaultUrl: string = "http://localhost:8080"): string {
  return getThreadServiceBaseUrl() || defaultUrl;
}

/**
 * Validate that a URL is a valid HTTP/HTTPS URL
 * @param url - URL to validate
 * @returns true if valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * UUID pattern for thread ID validation
 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID
 * @param id - String to check
 * @returns true if valid UUID, false otherwise
 */
export function isValidUUID(id: string): boolean {
  return UUID_PATTERN.test(id);
}

