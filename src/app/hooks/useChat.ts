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
import { getThreadServiceBaseUrl, isValidUUID } from "@/lib/threadServiceConfig";
import { toast } from "sonner";

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
  const [fallbackThreadId, setFallbackThreadId] = useState<string | null>(null); // Thread service UUID for fallback loading
  const [fallbackMessages, setFallbackMessages] = useState<Message[]>([]);
  const [isLoadingFallbackMessages, setIsLoadingFallbackMessages] = useState(false);
  // Use ref to track fallback messages to avoid dependency issues
  const fallbackMessagesRef = useRef<Message[]>([]);
  // Use ref to track previous stream message count to avoid infinite loops
  const previousStreamMessageCountRef = useRef<number>(0);
  // Track if we've already attempted to load fallback messages for this thread
  const fallbackLoadAttemptedRef = useRef<string | null>(null);
  
  // Resolve threadId to LangGraph thread ID if it's a thread service UUID
  useEffect(() => {
    if (!threadId) {
      setResolvedThreadId(null);
      setServiceOnlyThreadId(null);
      setFallbackThreadId(null);
      setFallbackMessages([]);
      fallbackMessagesRef.current = [];
      return;
    }

    // Check if threadId is a UUID (thread service format)
    if (!isValidUUID(threadId)) {
      // Not a UUID, assume it's already a LangGraph thread ID
      setResolvedThreadId(threadId);
      setServiceOnlyThreadId(null);
      return;
    }

    // It's a UUID - try to resolve it from thread service
    const threadServiceUrl = getThreadServiceBaseUrl();
    if (!threadServiceUrl || !accessToken) {
      // Can't resolve, use as-is (will fail but that's expected)
      setResolvedThreadId(threadId);
      setServiceOnlyThreadId(null);
      return;
    }

    // Create AbortController to cancel in-flight requests when threadId changes
    const abortController = new AbortController();
    let isCurrentRequest = true;

    // Fetch from thread service to get langgraph_thread_id
    fetch(`${threadServiceUrl}/threads/${threadId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
    })
      .then((response) => {
        if (!isCurrentRequest) return null; // Ignore stale responses
        
        if (response.ok) {
          return response.json();
        } else if (response.status === 404) {
          // Thread doesn't exist in thread service - might be a LangGraph-only thread
          // This is expected for threads that were never persisted or were created before persistence was enabled
          // Silently use the ID as a LangGraph thread ID
          if (isCurrentRequest) {
            setResolvedThreadId(threadId);
            setServiceOnlyThreadId(null);
          }
          return null;
        } else {
          if (isCurrentRequest) {
            console.warn(`[useChat] Failed to fetch thread ${threadId} from thread service: ${response.status}`);
            toast.error(`Failed to load thread: ${response.statusText || "Unknown error"}`);
            setResolvedThreadId(threadId);
            setServiceOnlyThreadId(null);
          }
          return null;
        }
      })
      .then(async (threadData) => {
        if (!isCurrentRequest || !threadData) return; // Ignore stale responses
        
        const langgraphId = threadData.metadata?.langgraph_thread_id;
        const messageCount = threadData.messages?.length ?? 0;
        
        console.log(`[useChat] Thread ${threadId} from thread service:`, {
          threadId: threadData.id,
          hasLanggraphId: !!langgraphId,
          langgraphId,
          messageCount,
          participantCount: threadData.participants?.length ?? 0,
        });
        
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
          console.log(`[useChat] Resolved thread service UUID ${threadId} to LangGraph ID ${langgraphId} (has ${messageCount} messages in DB)`);
          setResolvedThreadId(langgraphId);
          setServiceOnlyThreadId(null);
          // Store the thread service UUID for potential fallback
          setFallbackThreadId(threadId);
        } else {
          // Thread exists in thread service but has no LangGraph ID
          // This is a thread-service-only thread (not a LangGraph thread)
          // Mark it as read-only immediately - don't try to use UUID as LangGraph ID
          console.log(`[useChat] Thread ${threadId} is thread-service-only (no langgraph_thread_id). Has ${messageCount} messages in DB. Marking as read-only.`);
          setResolvedThreadId(null);
          setServiceOnlyThreadId(threadId);
          setFallbackThreadId(null);
        }
      })
      .catch((error) => {
        // Ignore AbortError (expected when threadId changes)
        if (error.name === "AbortError") {
          return;
        }
        
        if (isCurrentRequest) {
          console.warn(`[useChat] Error resolving thread ${threadId}:`, error);
          toast.error("Failed to resolve thread. Please try again.");
          setResolvedThreadId(threadId); // Fallback to original ID
          setServiceOnlyThreadId(null);
          setFallbackThreadId(null);
        }
      });

    return () => {
      // Cancel the request when threadId changes or component unmounts
      isCurrentRequest = false;
      abortController.abort();
    };
  }, [threadId, accessToken, setThreadId, client]);
  
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

    const threadServiceUrl = getThreadServiceBaseUrl();
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
        console.log(`[useChat] Fetched thread ${serviceOnlyThreadId} from thread service:`, {
          threadId: threadData.id,
          messageCount: threadData.messages?.length ?? 0,
          hasMessages: !!threadData.messages && threadData.messages.length > 0,
          participantCount: threadData.participants?.length ?? 0,
        });
        
        if (!threadData.messages || threadData.messages.length === 0) {
          console.warn(`[useChat] Thread ${serviceOnlyThreadId} exists but has no messages in database`);
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
            // First try to find participant by ID
            let participant = msg.participant_id 
              ? threadData.participants?.find(p => p.id === msg.participant_id)
              : null;
            
            // If no participant found by ID, try to infer from message kind
            if (!participant) {
              if (msg.kind === "tool_call") {
                messageType = "tool";
              } else {
                // Default to agent if we can't determine
                messageType = "ai";
              }
            } else {
              // Map participant role to message type
              if (participant.role === "user") {
                messageType = "human";
              } else if (participant.role === "tool") {
                messageType = "tool";
              } else if (participant.role === "agent") {
                messageType = "ai";
              }
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
        toast.error("Failed to load thread messages. Please try again.");
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
        
        // Check if we have a fallback thread ID (thread service UUID)
        if (fallbackThreadId) {
          console.log(`[Stream Error] Thread ${resolvedThreadId} not found in LangGraph, falling back to thread service ${fallbackThreadId}`);
          // Load messages from thread service as fallback
          setServiceOnlyThreadId(fallbackThreadId);
          setResolvedThreadId(null);
          return;
        }
        
        // Check if resolvedThreadId is a UUID (thread service format)
        // If so, this might be a thread-service-only thread - mark as read-only
        if (resolvedThreadId && isValidUUID(resolvedThreadId) && threadId === resolvedThreadId) {
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
    [onHistoryRevalidate, resolvedThreadId, threadId, setThreadId, activeAssistant?.assistant_id, serviceOnlyThreadId, setServiceOnlyThreadId, fallbackThreadId]
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

  // Function to load messages from thread service
  const loadMessagesFromThreadService = useCallback(async (threadServiceId: string) => {
    if (!accessToken) return;
    
    const threadServiceUrl = getThreadServiceBaseUrl();
    if (!threadServiceUrl) {
      console.warn("[useChat] Cannot load fallback messages: NEXT_PUBLIC_THREAD_SERVICE_URL not configured");
      return;
    }

    setIsLoadingFallbackMessages(true);
    
    try {
      const response = await fetch(`${threadServiceUrl}/threads/${threadServiceId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch thread: ${response.status}`);
      }

      const threadData = (await response.json()) as {
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
      };

      console.log(`[useChat] Loaded fallback thread ${threadServiceId} from thread service:`, {
        threadId: threadData.id,
        messageCount: threadData.messages?.length ?? 0,
        hasMessages: !!threadData.messages && threadData.messages.length > 0,
        participantCount: threadData.participants?.length ?? 0,
      });

      if (!threadData.messages || threadData.messages.length === 0) {
        console.warn(`[useChat] Fallback thread ${threadServiceId} exists but has no messages in database`);
        setFallbackMessages([]);
        fallbackMessagesRef.current = [];
        setIsLoadingFallbackMessages(false);
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
            // First try to find participant by ID
            let participant = msg.participant_id 
              ? threadData.participants?.find(p => p.id === msg.participant_id)
              : null;
            
            // If no participant found by ID, try to infer from message kind
            if (!participant) {
              if (msg.kind === "tool_call") {
                messageType = "tool";
              } else {
                // Default to agent if we can't determine
                messageType = "ai";
              }
            } else {
              // Map participant role to message type
              if (participant.role === "user") {
                messageType = "human";
              } else if (participant.role === "tool") {
                messageType = "tool";
              } else if (participant.role === "agent") {
                messageType = "ai";
              }
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

      setFallbackMessages(convertedMessages);
      fallbackMessagesRef.current = convertedMessages;
      setIsLoadingFallbackMessages(false);
      console.log(`[useChat] Loaded ${convertedMessages.length} fallback messages from thread service for thread ${threadServiceId}`);
    } catch (error) {
      console.error(`[useChat] Failed to load fallback messages for thread ${threadServiceId}:`, error);
      toast.error("Failed to load thread messages. Please try again.");
      setFallbackMessages([]);
      fallbackMessagesRef.current = [];
      setIsLoadingFallbackMessages(false);
    }
  }, [accessToken]);

  // Sync ref with state
  useEffect(() => {
    fallbackMessagesRef.current = fallbackMessages;
  }, [fallbackMessages]);

  // Check if LangGraph has messages, and if not, fall back to DB
  useEffect(() => {
    // Only check if we have a resolved thread ID (LangGraph thread) and a fallback thread ID
    if (!resolvedThreadId || !fallbackThreadId || serviceOnlyThreadId) {
      // Only clear if there are messages to clear (avoid unnecessary state updates)
      if (fallbackMessagesRef.current.length > 0) {
        setFallbackMessages([]);
        fallbackMessagesRef.current = [];
      }
      if (isLoadingFallbackMessages) {
        setIsLoadingFallbackMessages(false);
      }
      previousStreamMessageCountRef.current = 0;
      fallbackLoadAttemptedRef.current = null;
      return;
    }

    // Reset attempt tracking if thread changed
    if (fallbackLoadAttemptedRef.current !== resolvedThreadId) {
      fallbackLoadAttemptedRef.current = null;
      previousStreamMessageCountRef.current = 0;
    }

    // Use refs to avoid dependency on stream.messages (which changes reference frequently)
    const currentMessageCount = stream.messages?.length ?? 0;
    const messageCountChanged = currentMessageCount !== previousStreamMessageCountRef.current;
    const isStillLoading = stream.isThreadLoading;
    const hasMessages = currentMessageCount > 0;

    // Update ref only when count actually changes
    if (messageCountChanged) {
      previousStreamMessageCountRef.current = currentMessageCount;
    }

    // Check if we should load fallback messages
    // Only attempt once per thread to prevent infinite loops
    const shouldLoadFallback = 
      !isStillLoading && 
      !hasMessages && 
      !isLoadingFallbackMessages && 
      fallbackMessagesRef.current.length === 0 && 
      fallbackLoadAttemptedRef.current !== resolvedThreadId;

    if (shouldLoadFallback) {
      console.log(`[useChat] LangGraph thread ${resolvedThreadId} has no messages, loading from thread service ${fallbackThreadId} as fallback`);
      fallbackLoadAttemptedRef.current = resolvedThreadId;
      loadMessagesFromThreadService(fallbackThreadId);
      return;
    }

    // Also check after a delay to catch cases where stream loads later (only if not already attempted)
    const checkTimeout = setTimeout(() => {
      // Re-check current state inside timeout using refs to avoid stale closures
      const latestMessageCount = stream.messages?.length ?? 0;
      const latestIsLoading = stream.isThreadLoading;
      const latestHasMessages = latestMessageCount > 0;
      
      if (!latestIsLoading && 
          !latestHasMessages && 
          !isLoadingFallbackMessages && 
          fallbackMessagesRef.current.length === 0 && 
          fallbackLoadAttemptedRef.current !== resolvedThreadId) {
        console.log(`[useChat] LangGraph thread ${resolvedThreadId} has no messages after delay, loading from thread service ${fallbackThreadId} as fallback`);
        fallbackLoadAttemptedRef.current = resolvedThreadId;
        loadMessagesFromThreadService(fallbackThreadId);
      }
    }, 2000);

    return () => clearTimeout(checkTimeout);
    // Only depend on resolvedThreadId, fallbackThreadId, and isThreadLoading to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedThreadId, fallbackThreadId, stream.isThreadLoading, serviceOnlyThreadId]);

  const sendMessage = useCallback(
    async (content: string): Promise<Message> => {
      const newMessage: Message = { id: uuidv4(), type: "human", content };
      
      // Helper function to build config with thread_id if available
      const buildSubmitConfig = (baseConfig?: Record<string, any>, explicitThreadId?: string | null) => {
        const config: Record<string, any> = {
          ...(baseConfig ?? {}),
          recursion_limit: 100,
        };
        
        // Use explicit thread_id if provided, otherwise use resolvedThreadId
        const threadIdToUse = explicitThreadId ?? resolvedThreadId;
        
        // Explicitly set thread_id in configurable if threadId exists
        // This prevents LangGraph from auto-creating a new thread
        if (threadIdToUse) {
          config.configurable = {
            ...(config.configurable ?? {}),
            thread_id: threadIdToUse,
          };
        }
        
        return config;
      };
      
      // If this is a thread-service-only thread (no LangGraph thread), create one and link it
      if (serviceOnlyThreadId && !resolvedThreadId) {
        const threadServiceUrl = getThreadServiceBaseUrl();
        
        if (threadServiceUrl && accessToken && client && activeAssistant) {
          try {
            // Create a new LangGraph thread
            const langgraphThread = await client.threads.create({
              assistantId: activeAssistant.assistant_id,
              config: activeAssistant.config,
            });
            
            const newLanggraphThreadId = langgraphThread.thread_id;
            
            // Update thread service metadata to link the LangGraph thread ID
            const updateResponse = await fetch(
              `${threadServiceUrl}/threads/${serviceOnlyThreadId}`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  metadata: {
                    langgraph_thread_id: newLanggraphThreadId,
                  },
                }),
              }
            );
            
            if (updateResponse.ok) {
              console.log(
                `[useChat] Created LangGraph thread ${newLanggraphThreadId} and linked it to thread service UUID ${serviceOnlyThreadId}`
              );
              
              // Restore existing messages from thread service to the new LangGraph thread
              // Load messages from thread service
              const threadResponse = await fetch(
                `${threadServiceUrl}/threads/${serviceOnlyThreadId}`,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                }
              );
              
              if (threadResponse.ok) {
                const threadData = await threadResponse.json();
                const existingMessages = threadData.messages || [];
                
                // Convert and restore messages to LangGraph thread
                if (existingMessages.length > 0 && client) {
                  const langgraphMessages: Message[] = [];
                  
                  for (const msg of existingMessages) {
                    let messageType: "human" | "ai" | "tool" = "ai";
                    
                    if (msg.metadata?.source_message_type) {
                      const sourceType = msg.metadata.source_message_type;
                      if (sourceType === "human" || sourceType === "ai" || sourceType === "tool") {
                        messageType = sourceType;
                      }
                    }
                    
                    const langGraphMessage: Message = {
                      id: msg.id || uuidv4(),
                      type: messageType,
                      content: msg.content,
                    };
                    
                    if (messageType === "tool" && msg.metadata?.tool_call_id) {
                      langGraphMessage.tool_call_id = msg.metadata.tool_call_id;
                    }
                    
                    langgraphMessages.push(langGraphMessage);
                  }
                  
                  // Restore messages to LangGraph thread state
                  try {
                    await client.threads.updateState(newLanggraphThreadId, {
                      values: { messages: langgraphMessages },
                    });
                    console.log(
                      `[useChat] Restored ${langgraphMessages.length} messages to LangGraph thread ${newLanggraphThreadId}`
                    );
                  } catch (error) {
                    console.warn(
                      `[useChat] Failed to restore messages to LangGraph thread:`,
                      error
                    );
                  }
                }
              }
              
              // Update resolved thread ID - this will cause the stream to reinitialize
              setResolvedThreadId(newLanggraphThreadId);
              setServiceOnlyThreadId(null);
              setFallbackThreadId(serviceOnlyThreadId);
              
              // Wait a moment for React to update the stream, then send the message
              // Use requestAnimationFrame to wait for the next render cycle
              // Pass newLanggraphThreadId explicitly since resolvedThreadId might not be updated yet
              requestAnimationFrame(() => {
                setTimeout(() => {
                  stream.submit(
                    { messages: [newMessage] },
                    {
                      optimisticValues: (prev) => ({
                        messages: [...(prev.messages ?? []), newMessage],
                      }),
                      config: buildSubmitConfig(activeAssistant.config, newLanggraphThreadId),
                    }
                  );
                }, 100); // Small delay to ensure stream has reinitialized
              });
            } else {
              console.error(
                `[useChat] Failed to update thread service metadata: ${updateResponse.status}`
              );
              // Still update the state and try sending
              setResolvedThreadId(newLanggraphThreadId);
              setServiceOnlyThreadId(null);
              setFallbackThreadId(serviceOnlyThreadId);
              // Pass newLanggraphThreadId explicitly since resolvedThreadId might not be updated yet
              requestAnimationFrame(() => {
                setTimeout(() => {
                  stream.submit(
                    { messages: [newMessage] },
                    {
                      optimisticValues: (prev) => ({
                        messages: [...(prev.messages ?? []), newMessage],
                      }),
                      config: buildSubmitConfig(activeAssistant.config, newLanggraphThreadId),
                    }
                  );
                }, 100);
              });
            }
          } catch (error) {
            console.error(
              `[useChat] Failed to create LangGraph thread for thread-service-only thread:`,
              error
            );
            // Fall through to try sending anyway (might fail, but at least we tried)
            stream.submit(
              { messages: [newMessage] },
              {
                optimisticValues: (prev) => ({
                  messages: [...(prev.messages ?? []), newMessage],
                }),
                config: buildSubmitConfig(activeAssistant.config),
              }
            );
          }
        } else {
          // Can't create LangGraph thread, but try sending anyway
          stream.submit(
            { messages: [newMessage] },
            {
              optimisticValues: (prev) => ({
                messages: [...(prev.messages ?? []), newMessage],
              }),
              config: buildSubmitConfig(activeAssistant.config),
            }
          );
        }
      } else {
        // Normal case: thread already has LangGraph ID or is not a service-only thread
        stream.submit(
          { messages: [newMessage] },
          {
            optimisticValues: (prev) => ({
              messages: [...(prev.messages ?? []), newMessage],
            }),
            config: buildSubmitConfig(activeAssistant?.config),
          }
        );
      }
      
      // Update thread list immediately when sending a message
      onHistoryRevalidate?.();
      return newMessage;
    },
    [
      stream,
      activeAssistant,
      serviceOnlyThreadId,
      resolvedThreadId,
      accessToken,
      client,
      onHistoryRevalidate,
    ]
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
  // If we have fallback messages (LangGraph has no messages but DB does), use those
  const messages = serviceOnlyThreadId 
    ? serviceOnlyMessages 
    : (fallbackMessages.length > 0 && stream.messages.length === 0 && !stream.isThreadLoading)
      ? fallbackMessages
      : stream.messages;
  const isThreadLoading = serviceOnlyThreadId 
    ? isLoadingServiceMessages 
    : (fallbackMessages.length > 0 && stream.messages.length === 0)
      ? isLoadingFallbackMessages
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
