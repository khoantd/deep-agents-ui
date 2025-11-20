import { useEffect, useRef } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { extractStringFromMessageContent } from "@/app/utils/utils";

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
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return new Set(parsed[threadId] ?? []);
  } catch {
    return new Set();
  }
}

function persistSyncedIds(threadId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    parsed[threadId] = Array.from(ids);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore serialization errors to avoid disrupting the UI
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
    if (!THREAD_SERVICE_BASE_URL || !threadId || messages.length === 0) {
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: threadId,
            title: deriveThreadTitle(messages),
            summary: deriveSummary(messages),
            metadata: {
              assistant_id: assistantId,
              source: "deepagents-ui",
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
              headers: { "Content-Type": "application/json" },
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
  }, [assistantId, assistantName, messages, threadId]);
}

