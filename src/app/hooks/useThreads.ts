import useSWRInfinite from "swr/infinite";
import type { Thread } from "@langchain/langgraph-sdk";
import { Client } from "@langchain/langgraph-sdk";
import { getConfig } from "@/lib/config";
import { useAuth } from "@/providers/AuthProvider";
import { safeResponseJson } from "@/lib/jsonUtils";
import { getThreadServiceBaseUrl } from "@/lib/threadServiceConfig";

export interface ThreadItem {
  id: string;
  updatedAt: Date;
  status: Thread["status"];
  title: string;
  description: string;
  assistantId?: string;
}

const DEFAULT_PAGE_SIZE = 20;

const THREAD_SERVICE_BASE_URL = getThreadServiceBaseUrl();

// Map thread service status to LangGraph status
function mapThreadServiceStatusToLangGraphStatus(
  status: "open" | "paused" | "closed"
): Thread["status"] {
  switch (status) {
    case "open":
      return "idle";
    case "paused":
      return "interrupted";
    case "closed":
      return "idle";
    default:
      return "idle";
  }
}

// Map LangGraph status filter to thread service status
function mapLangGraphStatusToThreadServiceStatus(
  status?: Thread["status"]
): "open" | "paused" | "closed" | undefined {
  switch (status) {
    case "idle":
      return "open"; // Map idle to open for thread service
    case "interrupted":
      return "paused";
    case "error":
      return undefined; // Thread service doesn't have error status
    case "busy":
      return "open"; // Map busy to open
    default:
      return undefined;
  }
}

export function useThreads(props: {
  status?: Thread["status"];
  limit?: number;
}) {
  const pageSize = props.limit || DEFAULT_PAGE_SIZE;
  const { accessToken } = useAuth();
  const config = getConfig();

  // Determine if we should use thread service (authenticated) or LangGraph (fallback)
  const useThreadService = !!(
    THREAD_SERVICE_BASE_URL &&
    accessToken &&
    config
  );

  // Debug logging to help diagnose issues
  if (THREAD_SERVICE_BASE_URL && !accessToken) {
    console.warn("[ThreadService] Thread service URL is configured but no access token is available. Falling back to LangGraph only.");
  }
  if (accessToken && !THREAD_SERVICE_BASE_URL) {
    console.warn("[ThreadService] Access token is available but thread service URL is not configured. Using LangGraph only.");
  }

  const apiKey =
    config?.langsmithApiKey ||
    process.env.NEXT_PUBLIC_LANGSMITH_API_KEY ||
    "";

  return useSWRInfinite(
    (pageIndex: number, previousPageData: ThreadItem[] | null) => {
      // If the previous page returned no items, we've reached the end
      if (previousPageData && previousPageData.length === 0) {
        return null;
      }

      if (!config) {
        return null;
      }

      if (useThreadService) {
        // When authenticated, fetch ONLY from thread service (database is source of truth)
        return {
          kind: "threadservice" as const,
          pageIndex,
          pageSize,
          baseUrl: THREAD_SERVICE_BASE_URL!,
          accessToken: accessToken!,
          status: props?.status,
          threadServiceStatus: mapLangGraphStatusToThreadServiceStatus(props?.status),
        };
      }

      // Fallback to LangGraph only when not authenticated
      if (!apiKey) {
        return null;
      }

      return {
        kind: "langgraph" as const,
        pageIndex,
        pageSize,
        deploymentUrl: config.deploymentUrl,
        assistantId: config.assistantId,
        apiKey,
        status: props?.status,
      };
    },
    async (key: any) => {
      if (key.kind === "threadservice") {
        // Fetch ONLY from thread service (database is source of truth)
        const { baseUrl, accessToken, pageIndex, pageSize, threadServiceStatus } = key;
        
        // Fetch from thread service
        const threadServiceParams = new URLSearchParams({
          limit: pageSize.toString(),
          offset: (pageIndex * pageSize).toString(),
        });
        if (threadServiceStatus) {
          threadServiceParams.append("status", threadServiceStatus);
        }

        try {
          const threadServiceResponse = await fetch(`${baseUrl}/threads?${threadServiceParams}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          });

          if (threadServiceResponse.ok) {
            const threadServiceData = await safeResponseJson<{ threads?: any[]; total?: number }>(threadServiceResponse, { threads: [] });
            if (!threadServiceData) {
              console.warn("[ThreadService] Failed to parse thread service response");
              return [];
            }
            
            const threadsArray = threadServiceData.threads || [];
            console.log(`[ThreadService] Fetched ${threadsArray.length} threads from database (total: ${threadServiceData.total ?? 'unknown'})`);
            return threadsArray.map((thread: any): ThreadItem => {
              // Handle both metadata and custom_metadata field names (Pydantic can serialize either way)
              const metadata = thread.metadata || thread.custom_metadata || {};
              const assistantIdFromMeta = metadata.assistant_id || config?.assistantId;
              
              // Use thread service UUID as the ID (this is the database primary key)
              // The langgraph_thread_id is stored in metadata for reference
              return {
                id: thread.id, // Thread service UUID - this is the source of truth
                updatedAt: new Date(thread.updated_at),
                status: mapThreadServiceStatusToLangGraphStatus(thread.status),
                title: thread.title || "Untitled Thread",
                description: thread.summary || "",
                assistantId: assistantIdFromMeta,
              };
            });
          } else {
            const errorText = await threadServiceResponse.text().catch(() => "Unknown error");
            console.error(
              `[ThreadService] Failed to fetch threads: ${threadServiceResponse.status} ${threadServiceResponse.statusText}`,
              errorText
            );
            // Return empty array on error - don't fall back to LangGraph
            return [];
          }
        } catch (error) {
          console.error("[ThreadService] Failed to fetch threads from thread service", error);
          // Return empty array on error - don't fall back to LangGraph
          return [];
        }
      } else if (key.kind === "langgraph") {
        // Fetch from LangGraph (fallback)
        const { deploymentUrl, assistantId, apiKey, status, pageIndex, pageSize } = key;
        const client = new Client({
          apiUrl: deploymentUrl,
          defaultHeaders: {
            "X-Api-Key": apiKey,
          },
        });

        const threads = await client.threads.search({
          limit: pageSize,
          offset: pageIndex * pageSize,
          sortBy: "updated_at",
          sortOrder: "desc",
          status,
          metadata: { assistant_id: assistantId },
        });

        return threads.map((thread): ThreadItem => {
          let title = "Untitled Thread";
          let description = "";

          try {
            if (thread.values && typeof thread.values === "object") {
              const values = thread.values as any;
              const firstHumanMessage = values.messages.find(
                (m: any) => m.type === "human"
              );
              if (firstHumanMessage?.content) {
                const content =
                  typeof firstHumanMessage.content === "string"
                    ? firstHumanMessage.content
                    : firstHumanMessage.content[0]?.text || "";
                title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
              }
              const firstAiMessage = values.messages.find(
                (m: any) => m.type === "ai"
              );
              if (firstAiMessage?.content) {
                const content =
                  typeof firstAiMessage.content === "string"
                    ? firstAiMessage.content
                    : firstAiMessage.content[0]?.text || "";
                description = content.slice(0, 100);
              }
            }
          } catch {
            // Fallback to thread ID
            title = `Thread ${thread.thread_id.slice(0, 8)}`;
          }

          return {
            id: thread.thread_id,
            updatedAt: new Date(thread.updated_at),
            status: thread.status,
            title,
            description,
            assistantId,
          };
        });
      }
    },
    {
      revalidateFirstPage: true,
      revalidateOnFocus: true,
    }
  );
}
