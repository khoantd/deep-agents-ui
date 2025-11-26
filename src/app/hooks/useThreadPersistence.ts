import { useEffect, useRef } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { extractStringFromMessageContent } from "@/app/utils/utils";
import { useAuth } from "@/providers/AuthProvider";

const THREAD_SERVICE_BASE_URL =
  process.env.NEXT_PUBLIC_THREAD_SERVICE_URL?.replace(/\/$/, "") || null;
const STORAGE_KEY = "thread-service-synced-messages";
const THREAD_MAP_STORAGE_KEY = "thread-service-thread-map";
const FILES_STORAGE_KEY = "thread-service-synced-files";

/**
 * Check if thread service is available by hitting the health endpoint.
 * Returns true if service is reachable, false otherwise.
 */
async function checkThreadServiceHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // Short timeout to avoid blocking
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch (error) {
    // Network error, timeout, or service unavailable
    return false;
  }
}

type ThreadPersistenceOptions = {
  threadId: string | null | undefined;
  assistantId?: string;
  assistantName?: string | null;
  messages: Message[];
  files?: Record<string, string>;
};

type ThreadIdMap = Record<string, string>;

function loadSyncedIds(threadId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      return new Set(parsed[threadId] ?? []);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        console.warn(
          `Failed to parse synced message IDs: ${parseError.message}. Clearing corrupted data.`
        );
        localStorage.removeItem(STORAGE_KEY);
      }
      return new Set();
    }
  } catch (error) {
    console.warn("Error loading synced message IDs:", error);
    return new Set();
  }
}

function persistSyncedIds(threadId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let parsed: Record<string, string[]> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          console.warn(
            `Failed to parse synced message IDs for persistence: ${parseError.message}. Starting fresh.`
          );
          // Clear corrupted data and start fresh
          parsed = {};
        } else {
          throw parseError;
        }
      }
    }
    parsed[threadId] = Array.from(ids);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    // Ignore serialization errors to avoid disrupting the UI
    console.warn("Error persisting synced message IDs:", error);
  }
}

function loadThreadIdMap(): ThreadIdMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(THREAD_MAP_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as ThreadIdMap;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      return {};
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        console.warn(
          `Failed to parse thread ID map: ${parseError.message}. Clearing corrupted data.`
        );
        localStorage.removeItem(THREAD_MAP_STORAGE_KEY);
      }
      return {};
    }
  } catch (error) {
    console.warn("Error loading thread ID map:", error);
    return {};
  }
}

function persistThreadIdMap(map: ThreadIdMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THREAD_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.warn("Error persisting thread ID map:", error);
  }
}

function deriveThreadTitle(messages: Message[]): string {
  const firstHuman = messages.find((m) => m.type === "human");
  if (!firstHuman) return "Deep Research Thread";
  const content = extractStringFromMessageContent(firstHuman.content);
  if (!content) return "Deep Research Thread";
  return content.length > 50 ? `${content.slice(0, 50)}…` : content;
}

function deriveSummary(messages: Message[]): string | undefined {
  const firstAi = messages.find((m) => m.type === "ai");
  if (!firstAi) return undefined;
  const content = extractStringFromMessageContent(firstAi.content);
  if (!content) return undefined;
  return content.length > 200 ? `${content.slice(0, 200)}…` : content;
}

function mapParticipantRole(message: Message): "user" | "agent" | "tool" {
  if (message.type === "human") return "user";
  if (message.type === "tool") return "tool";
  return "agent";
}

function mapMessageKind(message: Message): "text" | "tool_call" {
  if (message.type === "tool") return "tool_call";
  return "text";
}

function loadSyncedFiles(threadId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FILES_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
      return parsed[threadId] ?? {};
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        console.warn(
          `Failed to parse synced files: ${parseError.message}. Clearing corrupted data.`
        );
        localStorage.removeItem(FILES_STORAGE_KEY);
      }
      return {};
    }
  } catch (error) {
    console.warn("Error loading synced files:", error);
    return {};
  }
}

function persistSyncedFiles(threadId: string, files: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(FILES_STORAGE_KEY);
    let parsed: Record<string, Record<string, string>> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          console.warn(
            `Failed to parse synced files for persistence: ${parseError.message}. Starting fresh.`
          );
          parsed = {};
        } else {
          throw parseError;
        }
      }
    }
    parsed[threadId] = files;
    localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.warn("Error persisting synced files:", error);
  }
}

export function useThreadPersistence({
  threadId,
  assistantId,
  assistantName,
  messages,
  files = {},
}: ThreadPersistenceOptions) {
  const { accessToken } = useAuth();
  const createdThreadsRef = useRef<Set<string>>(new Set());
  const syncedIdsRef = useRef<Set<string>>(new Set());
  const syncingIdsRef = useRef<Set<string>>(new Set()); // Track messages currently being synced
  const lastThreadRef = useRef<string | null>(null);
  const threadIdMapRef = useRef<ThreadIdMap>({});
  const healthCheckRef = useRef<Promise<boolean> | null>(null);
  const syncInProgressRef = useRef<Promise<void> | null>(null); // Track ongoing sync operation
  const syncedFilesRef = useRef<Record<string, string>>({});
  const fileSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!threadId) return;
    if (lastThreadRef.current === threadId) return;
    lastThreadRef.current = threadId;
    syncedIdsRef.current = loadSyncedIds(threadId);
    syncingIdsRef.current.clear(); // Clear in-flight tracking when thread changes
    threadIdMapRef.current = loadThreadIdMap();
    syncedFilesRef.current = loadSyncedFiles(threadId);
  }, [threadId]);

  useEffect(() => {
    // Check prerequisites for thread persistence
    if (!threadId || messages.length === 0) {
      return;
    }

    if (!THREAD_SERVICE_BASE_URL) {
      console.warn(
        "[ThreadService] Thread persistence disabled: NEXT_PUBLIC_THREAD_SERVICE_URL not configured"
      );
      return;
    }

    if (!accessToken) {
      console.warn(
        "[ThreadService] Thread persistence disabled: User not authenticated. Threads will not be saved to database."
      );
      return;
    }

    let cancelled = false;

    // Check thread service health (cached per session)
    if (!healthCheckRef.current && THREAD_SERVICE_BASE_URL) {
      healthCheckRef.current = checkThreadServiceHealth(THREAD_SERVICE_BASE_URL);
      healthCheckRef.current.then((isHealthy) => {
        if (!isHealthy) {
          console.error(
            `[ThreadService] Thread service is not reachable at ${THREAD_SERVICE_BASE_URL}. ` +
            "Threads will not be persisted. Please ensure the thread service is running."
          );
        }
      });
    }

    async function ensureThreadExists(): Promise<string | null> {
      // If we already resolved a thread-service UUID for this LangGraph thread, reuse it
      const existingId = threadIdMapRef.current[threadId];
      if (existingId) {
        return existingId;
      }

      if (createdThreadsRef.current.has(threadId)) {
        // Thread was created in this session but we somehow lost the mapping; fall through
        // and try to resolve it from the service.
      }

      try {
        const response = await fetch(`${THREAD_SERVICE_BASE_URL}/threads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title: deriveThreadTitle(messages),
            summary: deriveSummary(messages),
            metadata: {
              assistant_id: assistantId,
              source: "deepagents-ui",
              langgraph_thread_id: threadId, // Store LangGraph thread ID in metadata
            },
            participants: [
              { role: "user", display_name: "User" },
              {
                role: "agent",
                display_name: assistantName || "Research Agent",
              },
              { role: "tool", display_name: "Tools" },
            ],
          }),
        });
        if (response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { id?: string }
            | null;
          const serviceThreadId = data?.id;
          if (serviceThreadId) {
            createdThreadsRef.current.add(threadId);
            threadIdMapRef.current = {
              ...threadIdMapRef.current,
              [threadId]: serviceThreadId,
            };
            persistThreadIdMap(threadIdMapRef.current);
            return serviceThreadId;
          }
          createdThreadsRef.current.add(threadId);
        } else if (response.status === 409) {
          // Thread already exists. We'll try to resolve its UUID below.
          createdThreadsRef.current.add(threadId);
        } else {
          const errorText = await response.text().catch(() => "Unknown error");
          console.error(
            `[ThreadService] Failed to create thread: ${response.status} ${response.statusText}`,
            errorText
          );
        }
      } catch (error) {
        console.error("[ThreadService] Failed to create thread (network error)", error);
      }

      // If we reach here, either creation failed or returned no ID.
      // Try to discover the existing thread by its langgraph_thread_id metadata.
      try {
        const params = new URLSearchParams({
          limit: "100",
          offset: "0",
        });
        const discoveryResponse = await fetch(
          `${THREAD_SERVICE_BASE_URL}/threads?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (discoveryResponse.ok) {
          const data = (await discoveryResponse.json().catch(() => null)) as
            | { threads?: Array<{ id: string; metadata?: Record<string, unknown> }> }
            | null;
          const threads = data?.threads ?? [];
          const match = threads.find(
            (t) =>
              (t.metadata as any)?.langgraph_thread_id === threadId
          );
          if (match?.id) {
            threadIdMapRef.current = {
              ...threadIdMapRef.current,
              [threadId]: match.id,
            };
            persistThreadIdMap(threadIdMapRef.current);
            return match.id;
          }
        }
      } catch (error) {
        console.warn(
          "[ThreadService] Failed to resolve existing thread by langgraph_thread_id",
          error
        );
      }

      return null;
    }

    async function syncMessages() {
      const newMessages = messages.filter(
        (message) =>
          message.id &&
          !syncedIdsRef.current.has(message.id) &&
          !syncingIdsRef.current.has(message.id) && // Don't sync messages already in-flight
          typeof message.content !== "undefined"
      );

      if (newMessages.length === 0) return;

      const serviceThreadId =
        threadIdMapRef.current[threadId] ?? (await ensureThreadExists());

      if (!serviceThreadId) {
        console.error(
          "[ThreadService] Cannot sync messages: Thread creation failed or thread-service UUID is unknown. " +
          "Messages will not be persisted to database."
        );
        return;
      }

      // Mark messages as in-flight immediately to prevent duplicate syncs
      for (const message of newMessages) {
        if (message.id) {
          syncingIdsRef.current.add(message.id);
        }
      }

      for (const message of newMessages) {
        if (!message.id) continue;
        const payload = {
          participant_role: mapParticipantRole(message),
          kind: mapMessageKind(message),
          content: extractStringFromMessageContent(message.content),
          metadata: {
            source_message_type: message.type,
            assistant_id: assistantId,
          },
          attachments: [],
        };

        try {
          const messageResponse = await fetch(
            `${THREAD_SERVICE_BASE_URL}/threads/${serviceThreadId}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(payload),
            }
          );
          
          if (messageResponse.ok) {
            syncedIdsRef.current.add(message.id);
            persistSyncedIds(threadId, syncedIdsRef.current);
          } else {
            const errorText = await messageResponse.text().catch(() => "Unknown error");
            console.error(
              `[ThreadService] Failed to persist message ${message.id}: ${messageResponse.status} ${messageResponse.statusText}`,
              errorText
            );
            // Continue with other messages even if one fails
          }
        } catch (error) {
          console.error(`[ThreadService] Failed to persist message ${message.id} (network error)`, error);
          // Continue with other messages even if one fails
        } finally {
          // Always remove from in-flight when done (success or failure)
          syncingIdsRef.current.delete(message.id);
        }
      }
    }

    // Chain sync operations to prevent concurrent syncs
    const currentSync = (async () => {
      // Check thread service health first
      if (healthCheckRef.current) {
        const isHealthy = await healthCheckRef.current;
        if (!isHealthy) {
          return; // Service is not available, skip persistence
        }
      }

      await ensureThreadExists();
      if (cancelled) return;
      
      // Wait for any previous sync to complete before starting a new one
      if (syncInProgressRef.current) {
        try {
          await syncInProgressRef.current;
        } catch (error) {
          // Ignore errors from previous sync
        }
      }
      
      if (cancelled) return;
      
      // Start new sync and track it
      syncInProgressRef.current = syncMessages();
      await syncInProgressRef.current;
      syncInProgressRef.current = null;
    })();
    
    // Track the current sync operation
    syncInProgressRef.current = currentSync;

    return () => {
      cancelled = true;
    };
  }, [assistantId, assistantName, messages, threadId, accessToken]);

  // File syncing with debouncing
  useEffect(() => {
    // Check prerequisites for file persistence
    if (!threadId || Object.keys(files).length === 0) {
      // If files are empty, we still want to sync to clear deleted files
      // But only if we have a thread
      if (!threadId) {
        return;
      }
    }

    if (!THREAD_SERVICE_BASE_URL) {
      return;
    }

    if (!accessToken) {
      return;
    }

    let cancelled = false;

    // Debounce file syncing to avoid excessive API calls
    if (fileSyncTimeoutRef.current) {
      clearTimeout(fileSyncTimeoutRef.current);
    }

    fileSyncTimeoutRef.current = setTimeout(async () => {
      if (cancelled) return;

      // Check if files have changed
      const currentFilesJson = JSON.stringify(files);
      const syncedFilesJson = JSON.stringify(syncedFilesRef.current);
      
      if (currentFilesJson === syncedFilesJson) {
        // No changes, skip sync
        return;
      }

      const serviceThreadId =
        threadIdMapRef.current[threadId] ?? (await (async () => {
          // Try to ensure thread exists
          try {
            const response = await fetch(`${THREAD_SERVICE_BASE_URL}/threads`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                title: deriveThreadTitle(messages),
                summary: deriveSummary(messages),
                metadata: {
                  assistant_id: assistantId,
                  source: "deepagents-ui",
                  langgraph_thread_id: threadId,
                },
                participants: [
                  { role: "user", display_name: "User" },
                  {
                    role: "agent",
                    display_name: assistantName || "Research Agent",
                  },
                  { role: "tool", display_name: "Tools" },
                ],
              }),
            });
            if (response.ok) {
              const data = (await response.json().catch(() => null)) as
                | { id?: string }
                | null;
              if (data?.id) {
                threadIdMapRef.current = {
                  ...threadIdMapRef.current,
                  [threadId]: data.id,
                };
                persistThreadIdMap(threadIdMapRef.current);
                return data.id;
              }
            }
          } catch (error) {
            console.error("[ThreadService] Failed to create thread for file sync", error);
          }
          return null;
        })());

      if (!serviceThreadId) {
        console.warn(
          "[ThreadService] Cannot sync files: Thread service UUID is unknown. " +
          "Files will not be persisted to database."
        );
        return;
      }

      // Update thread metadata with files
      try {
        const response = await fetch(
          `${THREAD_SERVICE_BASE_URL}/threads/${serviceThreadId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              metadata: {
                files: files,
              },
            }),
          }
        );

        if (response.ok) {
          syncedFilesRef.current = { ...files };
          persistSyncedFiles(threadId, syncedFilesRef.current);
        } else {
          const errorText = await response.text().catch(() => "Unknown error");
          console.error(
            `[ThreadService] Failed to persist files: ${response.status} ${response.statusText}`,
            errorText
          );
        }
      } catch (error) {
        console.error("[ThreadService] Failed to persist files (network error)", error);
      }
    }, 1000); // Debounce for 1 second

    return () => {
      cancelled = true;
      if (fileSyncTimeoutRef.current) {
        clearTimeout(fileSyncTimeoutRef.current);
      }
    };
  }, [files, threadId, accessToken, assistantId, assistantName, messages]);
}

