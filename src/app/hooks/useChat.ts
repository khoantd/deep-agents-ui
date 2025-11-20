"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import {
  type Message,
  type Assistant,
  type Checkpoint,
} from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import type { UseStreamThread } from "@langchain/langgraph-sdk/react";
import type { TodoItem } from "@/app/types/types";
import { useClient } from "@/providers/ClientProvider";
import { HumanResponse } from "@/app/types/inbox";
import { useQueryState } from "nuqs";
import { useAuth } from "@/providers/AuthProvider";

export type StateType = {
  messages: Message[];
  todos: TodoItem[];
  files: Record<string, string>;
  email?: {
    id?: string;
    subject?: string;
    page_content?: string;
  };
  ui?: any;
};

export function useChat({
  activeAssistant,
  onHistoryRevalidate,
  thread,
}: {
  activeAssistant: Assistant | null;
  onHistoryRevalidate?: () => void;
  thread?: UseStreamThread<StateType>;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const client = useClient();
  const { accessToken } = useAuth();
  const [resolvedThreadId, setResolvedThreadId] = useState<string | null>(null);
  
  // Resolve threadId to LangGraph thread ID if it's a thread service UUID
  useEffect(() => {
    if (!threadId) {
      setResolvedThreadId(null);
      return;
    }

    // Check if threadId is a UUID (thread service format)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(threadId)) {
      // Not a UUID, assume it's already a LangGraph thread ID
      setResolvedThreadId(threadId);
      return;
    }

    // It's a UUID - try to resolve it from thread service
    const threadServiceUrl = process.env.NEXT_PUBLIC_THREAD_SERVICE_URL?.replace(/\/$/, "");
    if (!threadServiceUrl || !accessToken) {
      // Can't resolve, use as-is (will fail but that's expected)
      setResolvedThreadId(threadId);
      return;
    }

    // Fetch from thread service to get langgraph_thread_id
    fetch(`${threadServiceUrl}/threads/${threadId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else if (response.status === 404) {
          // Thread doesn't exist in thread service - might be a LangGraph-only thread
          console.log(`[useChat] Thread ${threadId} not found in thread service, using as LangGraph ID`);
          setResolvedThreadId(threadId);
          return null;
        } else {
          console.warn(`[useChat] Failed to fetch thread ${threadId} from thread service: ${response.status}`);
          setResolvedThreadId(threadId);
          return null;
        }
      })
      .then((threadData) => {
        if (threadData) {
          const langgraphId = threadData.metadata?.langgraph_thread_id;
          if (langgraphId) {
            console.log(`[useChat] Resolved thread service UUID ${threadId} to LangGraph ID ${langgraphId}`);
            setResolvedThreadId(langgraphId);
          } else {
            // Thread exists but has no LangGraph ID - can't use it with useStream
            console.warn(`[useChat] Thread ${threadId} has no langgraph_thread_id, cannot use with LangGraph stream`);
            setResolvedThreadId(null); // Don't pass threadId to useStream
            // Clear the threadId from URL since it's not usable
            setThreadId(null);
          }
        }
      })
      .catch((error) => {
        console.warn(`[useChat] Error resolving thread ${threadId}:`, error);
        setResolvedThreadId(threadId); // Fallback to original ID
      });
  }, [threadId, accessToken, setThreadId]);
  
  // Use ref to track the last threadId to prevent infinite updates
  const lastThreadIdRef = useRef<string | null>(resolvedThreadId ?? null);
  
  // Memoize onThreadId callback to prevent infinite loops
  const handleThreadIdChange = useCallback(
    (newThreadId: string | null) => {
      // Only update if the threadId actually changed
      if (newThreadId !== lastThreadIdRef.current) {
        lastThreadIdRef.current = newThreadId;
        // Update the resolved thread ID and URL
        setResolvedThreadId(newThreadId);
        setThreadId(newThreadId);
      }
    },
    [setThreadId]
  );

  // Sync ref when resolvedThreadId changes
  useEffect(() => {
    lastThreadIdRef.current = resolvedThreadId ?? null;
  }, [resolvedThreadId]);

  // Enhanced error handler for streaming errors
  const handleStreamError = useCallback(
    (error: Error) => {
      // Check if it's a 404 error - this is expected for threads that don't exist in LangGraph
      const is404 = error?.message?.includes("404") || 
                   (error as any)?.status === 404 || 
                   (error as any)?.response?.status === 404 ||
                   (error?.message && error.message.includes("not found"));
      
      if (is404) {
        // Thread doesn't exist in LangGraph - this is expected for thread service-only threads
        // Silently handle - don't log as an error
        console.log(`[Stream Error] Thread ${resolvedThreadId} not found in LangGraph (expected for thread service-only threads)`);
        // Clear the threadId from URL since it's not usable
        if (threadId) {
          setThreadId(null);
        }
        return;
      }
      
      // Check if it's a JSON parsing error
      if (error instanceof SyntaxError || error.message.includes("JSON.parse") || error.message.includes("bad escaped")) {
        console.warn(
          "[Stream Error] JSON parsing error detected. This may be due to invalid escape sequences in tool results or message content.",
          {
            error: error.message,
            threadId: resolvedThreadId,
            assistantId: activeAssistant?.assistant_id,
          }
        );
        // Don't crash the app - just log and continue
        // The stream will attempt to reconnect if configured
      } else {
        // Other errors - log for debugging
        console.error("[Stream Error]", error);
      }
      
      onHistoryRevalidate?.();
    },
    [onHistoryRevalidate, resolvedThreadId, threadId, setThreadId, activeAssistant?.assistant_id]
  );

  const stream = useStream<StateType>({
    assistantId: activeAssistant?.assistant_id || "",
    client: client ?? undefined,
    reconnectOnMount: true,
    threadId: resolvedThreadId ?? null, // Use resolved thread ID (LangGraph ID or null)
    onThreadId: handleThreadIdChange,
    defaultHeaders: { "x-auth-scheme": "langsmith" },
    // Revalidate thread list when stream finishes, errors, or creates new thread
    onFinish: onHistoryRevalidate,
    onError: handleStreamError,
    onCreated: onHistoryRevalidate,
    experimental_thread: thread,
  });

  const sendMessage = useCallback(
    (content: string): Message => {
      const newMessage: Message = { id: uuidv4(), type: "human", content };
      stream.submit(
        { messages: [newMessage] },
        {
          optimisticValues: (prev) => ({
            messages: [...(prev.messages ?? []), newMessage],
          }),
          config: { ...(activeAssistant?.config ?? {}), recursion_limit: 100 },
        }
      );
      // Update thread list immediately when sending a message
      onHistoryRevalidate?.();
      return newMessage;
    },
    [stream, activeAssistant?.config, onHistoryRevalidate]
  );

  const runSingleStep = useCallback(
    (
      messages: Message[],
      checkpoint?: Checkpoint,
      isRerunningSubagent?: boolean,
      optimisticMessages?: Message[]
    ) => {
      if (checkpoint) {
        stream.submit(undefined, {
          ...(optimisticMessages
            ? { optimisticValues: { messages: optimisticMessages } }
            : {}),
          config: activeAssistant?.config,
          checkpoint: checkpoint,
          ...(isRerunningSubagent
            ? { interruptAfter: ["tools"] }
            : { interruptBefore: ["tools"] }),
        });
      } else {
        stream.submit(
          { messages },
          { config: activeAssistant?.config, interruptBefore: ["tools"] }
        );
      }
    },
    [stream, activeAssistant?.config]
  );

  const setFiles = useCallback(
    async (files: Record<string, string>) => {
      if (!threadId) return;
      // TODO: missing a way how to revalidate the internal state
      // I think we do want to have the ability to externally manage the state
      await client.threads.updateState(threadId, { values: { files } });
    },
    [client, threadId]
  );

  const continueStream = useCallback(
    (hasTaskToolCall?: boolean) => {
      stream.submit(undefined, {
        config: {
          ...(activeAssistant?.config || {}),
          recursion_limit: 100,
        },
        ...(hasTaskToolCall
          ? { interruptAfter: ["tools"] }
          : { interruptBefore: ["tools"] }),
      });
      // Update thread list when continuing stream
      onHistoryRevalidate?.();
    },
    [stream, activeAssistant?.config, onHistoryRevalidate]
  );

  const sendHumanResponse = useCallback(
    (response: HumanResponse[]) => {
      stream.submit(null, { command: { resume: response } });
      // Update thread list when resuming from interrupt
      onHistoryRevalidate?.();
    },
    [stream, onHistoryRevalidate]
  );

  const markCurrentThreadAsResolved = useCallback(() => {
    stream.submit(null, { command: { goto: "__end__", update: null } });
    // Update thread list when marking thread as resolved
    onHistoryRevalidate?.();
  }, [stream, onHistoryRevalidate]);

  const stopStream = useCallback(() => {
    stream.stop();
  }, [stream]);

  return {
    stream,
    todos: stream.values.todos ?? [],
    files: stream.values.files ?? {},
    email: stream.values.email,
    ui: stream.values.ui,
    setFiles,
    messages: stream.messages,
    isLoading: stream.isLoading,
    isThreadLoading: stream.isThreadLoading,
    interrupt: stream.interrupt,
    getMessagesMetadata: stream.getMessagesMetadata,
    sendMessage,
    runSingleStep,
    continueStream,
    stopStream,
    sendHumanResponse,
    markCurrentThreadAsResolved,
  };
}
