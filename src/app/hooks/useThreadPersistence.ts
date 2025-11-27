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
  // Store participant ID mapping: threadId -> role -> participant_id
  const participantMapRef = useRef<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (!threadId) return;
    if (lastThreadRef.current === threadId) return;
    lastThreadRef.current = threadId;
    syncedIdsRef.current = loadSyncedIds(threadId);
    syncingIdsRef.current.clear(); // Clear in-flight tracking when thread changes
    threadIdMapRef.current = loadThreadIdMap();
    syncedFilesRef.current = loadSyncedFiles(threadId);
    // Note: participant mapping will be loaded when thread is created/fetched
  }, [threadId]);

  // Immediately create thread in database when threadId is set (even before messages arrive)
  useEffect(() => {
    // Check prerequisites for immediate thread creation
    if (!threadId) {
      return;
    }

    if (!THREAD_SERVICE_BASE_URL) {
      return; // Silently skip if service not configured
    }

    if (!accessToken) {
      return; // Silently skip if user not authenticated
    }

    // Check if thread already exists in our mapping
    if (threadIdMapRef.current[threadId]) {
      return; // Thread already exists, no need to create
    }

    // Check if we're already creating this thread
    if (createdThreadsRef.current.has(threadId)) {
      return; // Thread creation already in progress or completed
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

    async function createThreadImmediately(): Promise<void> {
      // Wait for health check if it's in progress
      if (healthCheckRef.current) {
        const isHealthy = await healthCheckRef.current;
        if (!isHealthy || cancelled) {
          return; // Service is not available, skip creation
        }
      }

      // Double-check we still need to create (might have been created by another effect)
      if (threadIdMapRef.current[threadId] || cancelled) {
        return;
      }

      try {
        const response = await fetch(`${THREAD_SERVICE_BASE_URL}/threads`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title: "New Thread", // Placeholder title, will be updated when messages arrive
            summary: undefined,
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
            | { id?: string; participants?: Array<{ id: string; role: string }> }
            | null;
          const serviceThreadId = data?.id;
          if (serviceThreadId && !cancelled) {
            createdThreadsRef.current.add(threadId);
            threadIdMapRef.current = {
              ...threadIdMapRef.current,
              [threadId]: serviceThreadId,
            };
            persistThreadIdMap(threadIdMapRef.current);

            // Store participant mapping
            if (data?.participants) {
              const roleMap: Record<string, string> = {};
              for (const participant of data.participants) {
                roleMap[participant.role] = participant.id;
              }
              participantMapRef.current[threadId] = roleMap;
            } else {
              // Fetch participants if not included in response
              try {
                const participantResponse = await fetch(
                  `${THREAD_SERVICE_BASE_URL}/threads/${serviceThreadId}`,
                  {
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      "Content-Type": "application/json",
                    },
                  }
                );
                if (participantResponse.ok) {
                  const threadData = (await participantResponse.json()) as {
                    participants?: Array<{ id: string; role: string }>;
                  };
                  if (threadData.participants) {
                    const roleMap: Record<string, string> = {};
                    for (const participant of threadData.participants) {
                      roleMap[participant.role] = participant.id;
                    }
                    participantMapRef.current[threadId] = roleMap;
                  }
                }
              } catch (error) {
                console.warn("[ThreadService] Failed to load participant mapping", error);
              }
            }

            console.log(
              `[ThreadService] Created thread in database immediately for threadId: ${threadId}`
            );
          } else if (!cancelled) {
            createdThreadsRef.current.add(threadId);
          }
        } else if (response.status === 409) {
          // Thread already exists (might have been created by another process)
          createdThreadsRef.current.add(threadId);
          // Try to discover the existing thread
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
                | { threads?: Array<{ id: string; metadata?: Record<string, unknown>; participants?: Array<{ id: string; role: string }> }> }
                | null;
              const threads = data?.threads ?? [];
              const match = threads.find(
                (t) =>
                  (t.metadata as any)?.langgraph_thread_id === threadId
              );
              if (match?.id && !cancelled) {
                threadIdMapRef.current = {
                  ...threadIdMapRef.current,
                  [threadId]: match.id,
                };
                persistThreadIdMap(threadIdMapRef.current);

                // Store participant mapping
                if (match.participants) {
                  const roleMap: Record<string, string> = {};
                  for (const participant of match.participants) {
                    roleMap[participant.role] = participant.id;
                  }
                  participantMapRef.current[threadId] = roleMap;
                }
              }
            }
          } catch (error) {
            console.warn(
              "[ThreadService] Failed to resolve existing thread by langgraph_thread_id",
              error
            );
          }
        } else {
          const errorText = await response.text().catch(() => "Unknown error");
          console.error(
            `[ThreadService] Failed to create thread immediately: ${response.status} ${response.statusText}`,
            errorText
          );
        }
      } catch (error) {
        console.error("[ThreadService] Failed to create thread immediately (network error)", error);
      }
    }

    // Create thread immediately
    createThreadImmediately();

    return () => {
      cancelled = true;
    };
  }, [threadId, accessToken, assistantId, assistantName]);

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
        // Also ensure we have participant mapping for this thread
        await loadParticipantMapping(threadId, existingId);
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
            | { id?: string; participants?: Array<{ id: string; role: string }> }
            | null;
          const serviceThreadId = data?.id;
          if (serviceThreadId) {
            createdThreadsRef.current.add(threadId);
            threadIdMapRef.current = {
              ...threadIdMapRef.current,
              [threadId]: serviceThreadId,
            };
            persistThreadIdMap(threadIdMapRef.current);
            
            // Store participant mapping
            if (data?.participants) {
              const roleMap: Record<string, string> = {};
              for (const participant of data.participants) {
                roleMap[participant.role] = participant.id;
              }
              participantMapRef.current[threadId] = roleMap;
            } else {
              // Fetch participants if not included in response
              await loadParticipantMapping(threadId, serviceThreadId);
            }
            
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
            | { threads?: Array<{ id: string; metadata?: Record<string, unknown>; participants?: Array<{ id: string; role: string }> }> }
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
            
            // Store participant mapping
            if (match.participants) {
              const roleMap: Record<string, string> = {};
              for (const participant of match.participants) {
                roleMap[participant.role] = participant.id;
              }
              participantMapRef.current[threadId] = roleMap;
            } else {
              await loadParticipantMapping(threadId, match.id);
            }
            
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

    async function loadParticipantMapping(langgraphThreadId: string, serviceThreadId: string): Promise<void> {
      try {
        const response = await fetch(
          `${THREAD_SERVICE_BASE_URL}/threads/${serviceThreadId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (response.ok) {
          const threadData = (await response.json()) as {
            participants?: Array<{ id: string; role: string }>;
          };
          if (threadData.participants) {
            const roleMap: Record<string, string> = {};
            for (const participant of threadData.participants) {
              roleMap[participant.role] = participant.id;
            }
            participantMapRef.current[langgraphThreadId] = roleMap;
          }
        }
      } catch (error) {
        console.warn("[ThreadService] Failed to load participant mapping", error);
      }
    }

    async function updateThreadTitleIfNeeded(serviceThreadId: string): Promise<void> {
      // Only update title if we can derive a better one from current messages
      const derivedTitle = deriveThreadTitle(messages);
      
      // Skip update if still using default title (means we can't extract a better title yet)
      if (derivedTitle === "Deep Research Thread") {
        return;
      }

      try {
        // Fetch current thread to check if title needs updating
        const getResponse = await fetch(
          `${THREAD_SERVICE_BASE_URL}/threads/${serviceThreadId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (getResponse.ok) {
          const threadData = await getResponse.json();
          const currentTitle = threadData.title || "";
          
          // Update title if it's still the default or empty
          // Always update if current title is default to ensure threads get proper titles
          if (!currentTitle || currentTitle === "Deep Research Thread" || currentTitle === "Untitled Thread") {
            console.log(
              `[ThreadService] Updating thread title from "${currentTitle}" to "${derivedTitle}"`
            );
            
            const updateResponse = await fetch(
              `${THREAD_SERVICE_BASE_URL}/threads/${serviceThreadId}`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  title: derivedTitle,
                  summary: deriveSummary(messages),
                }),
              }
            );

            if (updateResponse.ok) {
              console.log(`[ThreadService] Successfully updated thread title to "${derivedTitle}"`);
            } else {
              const errorText = await updateResponse.text().catch(() => "Unknown error");
              console.warn(
                `[ThreadService] Failed to update thread title: ${updateResponse.status} ${updateResponse.statusText}`,
                errorText
              );
            }
          } else {
            // Title already set, no need to update
            console.debug(
              `[ThreadService] Thread already has title "${currentTitle}", skipping update`
            );
          }
        }
      } catch (error) {
        // Silently fail - title update is not critical
        console.warn("[ThreadService] Failed to update thread title", error);
      }
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

      // Ensure we have participant mapping before syncing messages
      if (!participantMapRef.current[threadId]) {
        await loadParticipantMapping(threadId, serviceThreadId);
      }

      for (const message of newMessages) {
        if (!message.id) continue;
        const role = mapParticipantRole(message);
        const participantId = participantMapRef.current[threadId]?.[role] || null;
        
        // Build metadata with all available information
        const metadata: Record<string, any> = {
          source_message_type: message.type,
          assistant_id: assistantId,
        };

        // Store tool calls from AI messages
        // Tool calls can be in multiple places: message.tool_calls, message.additional_kwargs.tool_calls, or message.content (tool_use blocks)
        if (message.type === "ai") {
          const toolCalls: any[] = [];
          
          // Check message.tool_calls (primary location)
          if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
            toolCalls.push(...message.tool_calls);
          }
          
          // Check additional_kwargs.tool_calls (alternative location)
          if (message.additional_kwargs?.tool_calls && Array.isArray(message.additional_kwargs.tool_calls)) {
            toolCalls.push(...message.additional_kwargs.tool_calls);
          }
          
          // Check content array for tool_use blocks (Claude format)
          if (Array.isArray(message.content)) {
            const toolUseBlocks = message.content.filter(
              (block: any) => block && typeof block === "object" && block.type === "tool_use"
            );
            if (toolUseBlocks.length > 0) {
              toolCalls.push(...toolUseBlocks);
            }
          }
          
          // Store unique tool calls (deduplicate by id if available)
          if (toolCalls.length > 0) {
            const uniqueToolCalls = new Map<string, any>();
            toolCalls.forEach((call: any) => {
              const callId = call.id || call.tool_call_id || call.name || `tool-${Math.random()}`;
              if (!uniqueToolCalls.has(callId)) {
                uniqueToolCalls.set(callId, {
                  id: call.id || call.tool_call_id || null,
                  name: call.name || call.function?.name || "unknown_tool",
                  args: call.args || call.function?.arguments || call.input || {},
                  type: call.type || "function",
                });
              }
            });
            metadata.tool_calls = Array.from(uniqueToolCalls.values());
          }
        }

        // Store tool call information for tool messages
        if (message.type === "tool") {
          const toolCallId = (message as any).tool_call_id || message.tool_call_id;
          const toolName = (message as any).name || "unknown_tool";
          
          if (toolCallId) {
            metadata.tool_call_id = toolCallId;
          }
          if (toolName) {
            metadata.tool_name = toolName;
          }
        }

        // Store additional metadata if available
        if (message.additional_kwargs) {
          // Merge additional_kwargs into metadata, but don't overwrite existing keys
          Object.keys(message.additional_kwargs).forEach((key) => {
            if (!metadata[key] && key !== "tool_calls") {
              // tool_calls is already handled above for AI messages
              metadata[key] = (message.additional_kwargs as any)[key];
            }
          });
        }
        
        const payload = {
          participant_id: participantId,
          kind: mapMessageKind(message),
          content: extractStringFromMessageContent(message.content),
          metadata,
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

      const serviceThreadId = await ensureThreadExists();
      if (cancelled || !serviceThreadId) return;
      
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
      
      // Also check and update title even if no new messages were synced
      // This handles the case where thread was created with default title but messages are already available
      await updateThreadTitleIfNeeded(serviceThreadId);
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

