/**
 * Safe JSON parsing utilities to handle invalid escape sequences and malformed JSON.
 */

/**
 * Sanitize a JSON string by fixing invalid escape sequences.
 * This fixes common issues like invalid escape sequences that cause JSON.parse to fail.
 * 
 * @param jsonString - The JSON string to sanitize
 * @returns Sanitized JSON string
 */
function sanitizeJsonString(jsonString: string): string {
  // Fix invalid escape sequences
  // Valid escape sequences in JSON: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
  // We need to fix invalid ones like \x, \a, etc.
  
  // First, handle incomplete Unicode escapes (\u not followed by 4 hex digits)
  let sanitized = jsonString.replace(/\\u(?![0-9a-fA-F]{4})/g, 'u');
  
  // Fix invalid escape sequences (backslash not followed by valid escape char)
  // We need to be careful not to break valid escapes
  // Match: \ followed by a character that's not a valid escape sequence
  sanitized = sanitized.replace(/\\([^"\\/bfnrtu])/g, '$1');
  
  // Fix backslashes at end of string or line (invalid)
  sanitized = sanitized.replace(/\\\n/g, '\n');
  sanitized = sanitized.replace(/\\\r/g, '\r');
  sanitized = sanitized.replace(/\\$/g, '');
  
  return sanitized;
}

/**
 * Safely parse a JSON string, handling invalid escape sequences gracefully.
 * Attempts to sanitize the string if initial parsing fails due to escape sequence errors.
 * 
 * @param jsonString - The JSON string to parse
 * @param fallback - Fallback value to return if parsing fails
 * @returns The parsed object or the fallback value
 */
export function safeJsonParse<T = any>(
  jsonString: string,
  fallback: T | null = null
): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes("escaped") || errorMessage.includes("escape")) {
        // Try to sanitize and parse again
        try {
          const sanitized = sanitizeJsonString(jsonString);
          return JSON.parse(sanitized) as T;
        } catch (retryError) {
          console.warn(
            `JSON parse error (invalid escape sequence, sanitization failed): ${error.message}`,
            {
              jsonLength: jsonString.length,
              preview: jsonString.substring(0, 200),
              retryError: retryError instanceof Error ? retryError.message : String(retryError),
            }
          );
        }
      } else {
        console.warn(`JSON parse error: ${error.message}`, {
          jsonLength: jsonString.length,
          preview: jsonString.substring(0, 200),
        });
      }
    } else {
      console.warn("Unexpected error parsing JSON:", error);
    }
    return fallback;
  }
}

/**
 * Safely parse JSON from a Response object.
 * Attempts to parse the response body as JSON, with fallback handling for errors.
 * 
 * @param response - The fetch Response object
 * @param fallback - Fallback value to return if parsing fails
 * @returns The parsed JSON data or the fallback value
 */
export async function safeResponseJson<T = any>(
  response: Response,
  fallback: T | null = null
): Promise<T | null> {
  try {
    // First, get the text to inspect it
    const text = await response.text();
    
    if (!text || text.trim().length === 0) {
      return fallback;
    }
    
    // Try to parse the JSON using safeJsonParse which handles escape sequences
    const parsed = safeJsonParse<T>(text, fallback);
    if (parsed !== fallback) {
      return parsed;
    }
    
    // If safeJsonParse returned fallback, log the error
    try {
      // Try one more time to see what the actual error is
      JSON.parse(text);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        const errorMessage = parseError.message.toLowerCase();
        if (errorMessage.includes("escaped") || errorMessage.includes("escape")) {
          console.warn(
            `Response JSON parse error (invalid escape sequence): ${parseError.message}`,
            {
              url: response.url,
              status: response.status,
              statusText: response.statusText,
              contentLength: text.length,
              preview: text.substring(0, 500),
            }
          );
        } else {
          console.warn(
            `Response JSON parse error: ${parseError.message}`,
            {
              url: response.url,
              status: response.status,
              statusText: response.statusText,
              contentLength: text.length,
              preview: text.substring(0, 500),
            }
          );
        }
      } else {
        console.warn("Unexpected error parsing response JSON:", parseError, {
          url: response.url,
          status: response.status,
        });
      }
    }
    
    return fallback;
  } catch (error) {
    console.warn("Error reading response body:", error, {
      url: response.url,
      status: response.status,
    });
    return fallback;
  }
}

