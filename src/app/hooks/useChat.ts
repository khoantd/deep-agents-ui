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
  const [serviceOnlyThreadId, setServiceOnlyThreadId] = useState<string | null>(
    null
  );
  const [serviceOnlyMessages, setServiceOnlyMessages] = useState<Message[]>([]);
  const [isLoadingServiceMessages, setIsLoadingServiceMessages] = useState(false);
  
  // Resolve threadId to LangGraph thread ID if it's a thread service UUID
  useEffect(() => {
    if (!threadId) {
      setResolvedThreadId(null);
      setServiceOnlyThreadId(null);
      return;
    }

    // Check if threadId is a UUID (thread service format)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(threadId)) {
      // Not a UUID, assume it's already a LangGraph thread ID
      setResolvedThreadId(threadId);
      setServiceOnlyThreadId(null);
      return;
    }

    // It's a UUID - try to resolve it from thread service
    const threadServiceUrl = process.env.NEXT_PUBLIC_THREAD_SERVICE_URL?.replace(/\/$/, "");
    if (!threadServiceUrl || !accessToken) {
      // Can't resolve, use as-is (will fail but that's expected)
      setResolvedThreadId(threadId);
      setServiceOnlyThreadId(null);
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
          // This is expected for threads that were never persisted or were created before persistence was enabled
          // Silently use the ID as a LangGraph thread ID
          setResolvedThreadId(threadId);
          setServiceOnlyThreadId(null);
          return null;
        } else {
          console.warn(`[useChat] Failed to fetch thread ${threadId} from thread service: ${response.status}`);
          setResolvedThreadId(threadId);
          setServiceOnlyThreadId(null);
          return null;
        }
      })
      .then(async (threadData) => {
        if (threadData) {
          const langgraphId = threadData.metadata?.langgraph_thread_id;
          
          // Load files from thread metadata if available
          const filesFromMetadata = threadData.metadata?.files;
          if (filesFromMetadata && typeof filesFromMetadata === "object" && langgraphId && client) {
            try {
              // Restore files to LangGraph state
              await client.threads.updateState(langgraphId, {
                values: { files: filesFromMetadata },
              });
              console.log(`[useChat] Restored ${Object.keys(filesFromMetadata).length} files from thread metadata`);
            } catch (error) {
              console.warn(`[useChat] Failed to restore files to LangGraph state:`, error);
            }
          }
          
          if (langgraphId) {
            console.log(`[useChat] Resolved thread service UUID ${threadId} to LangGraph ID ${langgraphId}`);
            setResolvedThreadId(langgraphId);
            setServiceOnlyThreadId(null);
          } else {
            // Thread exists in thread service but has no LangGraph ID
            // This is a thread-service-only thread (not a LangGraph thread)
            // Mark it as read-only immediately - don't try to use UUID as LangGraph ID
            console.log(`[useChat] Thread ${threadId} is thread-service-only (no langgraph_thread_id). Marking as read-only.`);
            setResolvedThreadId(null);
            setServiceOnlyThreadId(threadId);
          }
        }
      })
      .catch((error) => {
        console.warn(`[useChat] Error resolving thread ${threadId}:`, error);
        setResolvedThreadId(threadId); // Fallback to original ID
        setServiceOnlyThreadId(null);
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

  // Fetch messages from thread service for read-only threads
  useEffect(() => {
    if (!serviceOnlyThreadId || !accessToken) {
      setServiceOnlyMessages([]);
      setIsLoadingServiceMessages(false);
      return;
    }

    const threadServiceUrl = process.env.NEXT_PUBLIC_THREAD_SERVICE_URL?.replace(/\/$/, "");
    if (!threadServiceUrl) {
      console.warn("[useChat] Cannot fetch service-only messages: NEXT_PUBLIC_THREAD_SERVICE_URL not configured");
      return;
    }

    setIsLoadingServiceMessages(true);
    
    fetch(`${threadServiceUrl}/threads/${serviceOnlyThreadId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch thread: ${response.status}`);
        }
        return response.json();
      })
      .then((threadData: {
        id: string;
        messages?: Array<{
          id: string;
          content: string;
          kind: string;
          participant_id?: string;
          metadata?: {
            source_message_type?: string;
            tool_call_id?: string;
            assistant_id?: string;
          };
          created_at: string;
        }>;
        participants?: Array<{
          id: string;
          role: string;
        }>;
      }) => {
        if (!threadData.messages || threadData.messages.length === 0) {
          setServiceOnlyMessages([]);
          setIsLoadingServiceMessages(false);
          return;
        }

        // Sort messages by created_at to ensure correct order
        const sortedMessages = [...threadData.messages].sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeA - timeB;
        });

        // Convert thread service messages to LangGraph Message format
        const convertedMessages: Message[] = sortedMessages.map((msg) => {
          // Determine message type from metadata (most reliable) or participant role
          let messageType: "human" | "ai" | "tool" = "ai";
          
          if (msg.metadata?.source_message_type) {
            // Use stored source type if available (most reliable)
            const sourceType = msg.metadata.source_message_type;
            if (sourceType === "human" || sourceType === "ai" || sourceType === "tool") {
              messageType = sourceType;
            }
          } else {
            // Fallback: determine from participant role
            const participant = threadData.participants?.find(p => p.id === msg.participant_id);
            if (participant) {
              if (participant.role === "user") {
                messageType = "human";
              } else if (participant.role === "tool") {
                messageType = "tool";
              } else if (participant.role === "agent") {
                messageType = "ai";
              }
            } else if (msg.kind === "tool_call") {
              // If kind is tool_call, it's a tool message
              messageType = "tool";
            }
          }

          // For tool messages, we need tool_call_id
          const toolCallId = msg.metadata?.tool_call_id;

          const langGraphMessage: Message = {
            id: msg.id,
            type: messageType,
            content: msg.content,
          };

          // Add tool_call_id for tool messages
          if (messageType === "tool" && toolCallId) {
            langGraphMessage.tool_call_id = toolCallId;
          }

          // Preserve metadata if available
          if (msg.metadata) {
            langGraphMessage.additional_kwargs = {
              ...(langGraphMessage.additional_kwargs || {}),
              ...msg.metadata,
            };
          }

          return langGraphMessage;
        });

        setServiceOnlyMessages(convertedMessages);
        setIsLoadingServiceMessages(false);
        console.log(`[useChat] Loaded ${convertedMessages.length} messages from thread service for read-only thread ${serviceOnlyThreadId}`);
      })
      .catch((error) => {
        console.error(`[useChat] Failed to fetch messages for service-only thread ${serviceOnlyThreadId}:`, error);
        setServiceOnlyMessages([]);
        setIsLoadingServiceMessages(false);
      });
  }, [serviceOnlyThreadId, accessToken]);

  // Enhanced error handler for streaming errors
  const handleStreamError = useCallback(
    (error: Error) => {
      // Check if it's a 404 error - this is expected for threads that don't exist in LangGraph
      const is404 = error?.message?.includes("404") || 
                   (error as any)?.status === 404 || 
                   (error as any)?.response?.status === 404 ||
                   (error?.message && error.message.includes("not found"));
      
      if (is404) {
        // Thread doesn't exist in LangGraph
        // Check if this is a thread-service-only thread (already marked as read-only)
        if (serviceOnlyThreadId) {
          // This is expected - thread-service-only threads don't exist in LangGraph
          // Suppress the error since we've already marked it as read-only
          console.log(`[Stream Error] Thread ${resolvedThreadId} not found in LangGraph (expected for thread-service-only thread ${serviceOnlyThreadId})`);
          return;
        }
        
        // Check if resolvedThreadId is a UUID (thread service format)
        // If so, this might be a thread-service-only thread - mark as read-only
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (resolvedThreadId && uuidPattern.test(resolvedThreadId) && threadId === resolvedThreadId) {
          // This is a UUID that we tried to use as a LangGraph ID but it doesn't exist in LangGraph
          // Mark it as read-only so user can still view the thread
          console.log(`[Stream Error] Thread ${resolvedThreadId} not found in LangGraph, marking as read-only`);
          setServiceOnlyThreadId(resolvedThreadId);
          setResolvedThreadId(null);
          return;
        }
        
        // Otherwise, clear the threadId from URL since it's not usable
        console.log(`[Stream Error] Thread ${resolvedThreadId} not found in LangGraph`);
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
    [onHistoryRevalidate, resolvedThreadId, threadId, setThreadId, activeAssistant?.assistant_id, serviceOnlyThreadId, setServiceOnlyThreadId]
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

  // Use service-only messages when thread is read-only, otherwise use stream messages
  const messages = serviceOnlyThreadId ? serviceOnlyMessages : stream.messages;
  const isThreadLoading = serviceOnlyThreadId 
    ? isLoadingServiceMessages 
    : stream.isThreadLoading;

  return {
    stream,
    todos: stream.values.todos ?? [],
    files: stream.values.files ?? {},
    email: stream.values.email,
    ui: stream.values.ui,
    setFiles,
    messages,
    isLoading: stream.isLoading,
    isThreadLoading,
    interrupt: stream.interrupt,
    getMessagesMetadata: stream.getMessagesMetadata,
    sendMessage,
    runSingleStep,
    continueStream,
    stopStream,
    sendHumanResponse,
    markCurrentThreadAsResolved,
    serviceOnlyThreadId,
  };
}
