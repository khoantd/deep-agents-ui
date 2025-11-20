/**
 * Safe JSON parsing utilities to handle invalid escape sequences and malformed JSON.
 */

/**
 * Safely parse a JSON string, handling invalid escape sequences gracefully.
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
        console.warn(
          `JSON parse error (invalid escape sequence): ${error.message}`,
          {
            jsonLength: jsonString.length,
            preview: jsonString.substring(0, 200),
          }
        );
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
    
    // Try to parse the JSON
    try {
      return JSON.parse(text) as T;
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
      return fallback;
    }
  } catch (error) {
    console.warn("Error reading response body:", error, {
      url: response.url,
      status: response.status,
    });
    return fallback;
  }
}

