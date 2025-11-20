import { useEffect, useRef } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { extractStringFromMessageContent } from "@/app/utils/utils";
import { useAuth } from "@/providers/AuthProvider";

const THREAD_SERVICE_BASE_URL =
  process.env.NEXT_PUBLIC_THREAD_SERVICE_URL?.replace(/\/$/, "") || null;
const STORAGE_KEY = "thread-service-synced-messages";

type ThreadPersistenceOptions = {
  threadId: string | null | undefined;
  assistantId?: string;
  assistantName?: string | null;
  messages: Message[];
};

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

export function useThreadPersistence({
  threadId,
  assistantId,
  assistantName,
  messages,
}: ThreadPersistenceOptions) {
  const { accessToken } = useAuth();
  const createdThreadsRef = useRef<Set<string>>(new Set());
  const syncedIdsRef = useRef<Set<string>>(new Set());
  const lastThreadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!threadId) return;
    if (lastThreadRef.current === threadId) return;
    lastThreadRef.current = threadId;
    syncedIdsRef.current = loadSyncedIds(threadId);
  }, [threadId]);

  useEffect(() => {
    if (!THREAD_SERVICE_BASE_URL || !threadId || messages.length === 0 || !accessToken) {
      return;
    }

    let cancelled = false;

    async function ensureThreadExists() {
      if (createdThreadsRef.current.has(threadId)) {
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
          createdThreadsRef.current.add(threadId);
        } else if (response.status === 409) {
          createdThreadsRef.current.add(threadId);
        }
      } catch (error) {
        console.warn("[ThreadService] Failed to create thread", error);
      }
    }

    async function syncMessages() {
      const newMessages = messages.filter(
        (message) =>
          message.id &&
          !syncedIdsRef.current.has(message.id) &&
          typeof message.content !== "undefined"
      );

      if (newMessages.length === 0) return;

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
          await fetch(
            `${THREAD_SERVICE_BASE_URL}/threads/${threadId}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(payload),
            }
          );
          syncedIdsRef.current.add(message.id);
          persistSyncedIds(threadId, syncedIdsRef.current);
        } catch (error) {
          console.warn("[ThreadService] Failed to persist message", error);
          break;
        }
      }
    }

    (async () => {
      await ensureThreadExists();
      if (cancelled) return;
      await syncMessages();
    })();

    return () => {
      cancelled = true;
    };
  }, [assistantId, assistantName, messages, threadId, accessToken]);
}

