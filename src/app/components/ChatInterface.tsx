"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  FormEvent,
  Fragment,
} from "react";
import { Button } from "@/components/ui/button";
import {
  LoaderCircle,
  Square,
  ArrowUp,
  CheckCircle,
  Clock,
  Circle,
  FileIcon,
  Bookmark,
  BookmarkCheck,
  FileDown,
  MessageCircle,
  X,
} from "lucide-react";
import { ChatMessage } from "@/app/components/ChatMessage";
import type { TodoItem, ToolCall } from "@/app/types/types";
import { Assistant, Message } from "@langchain/langgraph-sdk";
import {
  extractStringFromMessageContent,
  isPreparingToCallTaskTool,
} from "@/app/utils/utils";
import { v4 as uuidv4 } from "uuid";
import { useChatContext } from "@/providers/ChatProvider";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { useStickToBottom } from "use-stick-to-bottom";
import { FilesPopover } from "@/app/components/TasksFilesSidebar";
import { MessageSearch } from "@/app/components/MessageSearch";
import { useMessageInteractions } from "@/app/hooks/useMessageInteractions";
import { MessageManagementBar } from "@/app/components/MessageManagementBar";
import {
  copyMessageWithContext,
  exportMessage,
  exportThread,
  getMessageSnippet,
  type ExportFormat,
} from "@/app/utils/messageActions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useThreadPersistence } from "@/app/hooks/useThreadPersistence";
import { safeJsonParse } from "@/lib/jsonUtils";

interface ChatInterfaceProps {
  assistant: Assistant | null;
  debugMode: boolean;
  // Optional controlled view props from host app
  view?: "chat" | "workflow";
  onViewChange?: (view: "chat" | "workflow") => void;
  hideInternalToggle?: boolean;
  InterruptActionsRenderer?: React.ComponentType;
  onInput?: (input: string) => void;

  controls: React.ReactNode;
  banner?: React.ReactNode;
  skeleton: React.ReactNode;
}

const getStatusIcon = (status: TodoItem["status"], className?: string) => {
  switch (status) {
    case "completed":
      return (
        <CheckCircle
          size={16}
          className={cn("text-success/80", className)}
        />
      );
    case "in_progress":
      return (
        <Clock
          size={16}
          className={cn("text-warning/80", className)}
        />
      );
    default:
      return (
        <Circle
          size={16}
          className={cn("text-tertiary/70", className)}
        />
      );
  }
};

export const ChatInterface = React.memo<ChatInterfaceProps>(
  ({
    assistant,
    debugMode,
    view,
    onViewChange,
    onInput,
    controls,
    banner,
    hideInternalToggle,
    skeleton,
  }) => {
    const [threadId] = useQueryState("threadId");
    const [agentId] = useQueryState("agentId");
    const [metaOpen, setMetaOpen] = useState<"tasks" | "files" | null>(null);
    const tasksContainerRef = useRef<HTMLDivElement | null>(null);
    const [isWorkflowView, setIsWorkflowView] = useState(false);
    const [messageSearchQuery, setMessageSearchQuery] = useState("");
    const [highlightedMessageId, setHighlightedMessageId] = useState<
      string | null
    >(null);
    const highlightedMessageRef = useRef<HTMLDivElement | null>(null);
    const [replyTarget, setReplyTarget] = useState<Message | null>(null);
    const [threadViewerParent, setThreadViewerParent] = useState<Message | null>(
      null
    );
    const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
    const [threadExportDialogOpen, setThreadExportDialogOpen] = useState(false);

    const {
      getReactions,
      toggleReaction,
      isBookmarked: isMessageBookmarked,
      toggleBookmark,
      bookmarkedMessageIds,
      recordReply,
      getReplyIds,
      getReplyCount,
      getParentId,
    } = useMessageInteractions(threadId);

    // Auto-scroll to highlighted message
    useEffect(() => {
      if (highlightedMessageId && highlightedMessageRef.current) {
        highlightedMessageRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, [highlightedMessageId]);

    const handleReplyInThread = useCallback((message: Message) => {
      setReplyTarget(message);
      setThreadViewerParent(null);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }, []);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const isControlledView = typeof view !== "undefined";
    const workflowView = isControlledView
      ? view === "workflow"
      : isWorkflowView;

    useEffect(() => {
      const timeout = setTimeout(() => void textareaRef.current?.focus());
      return () => clearTimeout(timeout);
    }, [threadId, agentId]);

    const setView = useCallback(
      (view: "chat" | "workflow") => {
        onViewChange?.(view);
        if (!isControlledView) {
          setIsWorkflowView(view === "workflow");
        }
      },
      [onViewChange, isControlledView]
    );

    const [input, _setInput] = useState("");
    const { scrollRef, contentRef } = useStickToBottom();

    const inputCallbackRef = useRef(onInput);
    inputCallbackRef.current = onInput;

    const setInput = useCallback(
      (value: string) => {
        _setInput(value);
        inputCallbackRef.current?.(value);
      },
      [inputCallbackRef]
    );

    const {
      stream,
      messages,
      todos,
      files,
      ui,
      setFiles,
      isLoading,
      isThreadLoading,
      interrupt,
      getMessagesMetadata,
      sendMessage,
      runSingleStep,
      continueStream,
      stopStream,
      serviceOnlyThreadId,
    } = useChatContext();

    useThreadPersistence({
      assistantId: assistant?.assistant_id,
      assistantName: assistant?.name,
      threadId,
      messages,
      files,
    });

    const isServiceOnly = Boolean(serviceOnlyThreadId);

    const messageMap = useMemo(() => {
      const map = new Map<string, Message>();
      messages.forEach((msg) => {
        if (msg.id) {
          map.set(msg.id, msg);
        }
      });
      return map;
    }, [messages]);

    const bookmarkedMessages = useMemo(
      () =>
        bookmarkedMessageIds
          .map((id) => (id ? messageMap.get(id) : undefined))
          .filter((msg): msg is Message => Boolean(msg)),
      [bookmarkedMessageIds, messageMap]
    );

    const resolveMessagesByIds = useCallback(
      (ids: string[]) =>
        ids
          .map((id) => (id ? messageMap.get(id) : undefined))
          .filter((msg): msg is Message => Boolean(msg)),
      [messageMap]
    );

    const threadReplies = useMemo(() => {
      if (!threadViewerParent?.id) {
        return [];
      }
      return resolveMessagesByIds(getReplyIds(threadViewerParent.id));
    }, [threadViewerParent, resolveMessagesByIds, getReplyIds]);

    const handleCopyWithContext = useCallback(
      async (message: Message, parentSnippet?: string) => {
        try {
          await copyMessageWithContext(message, threadId, parentSnippet);
          toast.success("Message copied with context");
        } catch (error) {
          console.error("Failed to copy message", error);
          toast.error("Unable to copy message");
        }
      },
      [threadId]
    );

    const handleExportMessage = useCallback(
      (message: Message, replies: Message[], format: ExportFormat) => {
        try {
          exportMessage({ message, replies, format, threadId });
          toast.success(`Exported message as ${format.toUpperCase()}`);
        } catch (error) {
          console.error("Failed to export message", error);
          toast.error("Unable to export message");
        }
      },
      [threadId]
    );

    const handleThreadExport = useCallback(
      (format: ExportFormat) => {
        try {
          exportThread({
            messages,
            format,
            threadId,
            title: "Deep Agents Thread Export",
          });
          toast.success(`Exported thread as ${format.toUpperCase()}`);
        } catch (error) {
          console.error("Failed to export thread", error);
          toast.error("Unable to export thread");
        }
      },
      [messages, threadId]
    );

    const submitDisabled = isLoading || !assistant || isServiceOnly;

    const handleSubmit = useCallback(
      (e?: FormEvent) => {
        if (e) {
          e.preventDefault();
        }
        if (submitDisabled) return;

        const messageText = input.trim();
        if (!messageText || isLoading) return;
        let newMessage: Message | null = null;
        if (debugMode) {
          newMessage = {
            id: uuidv4(),
            type: "human",
            content: messageText,
          };
          runSingleStep([newMessage]);
        } else {
          newMessage = sendMessage(messageText);
        }
        if (replyTarget?.id && newMessage?.id) {
          recordReply(replyTarget.id, newMessage.id);
          toast.success("Reply added to thread");
        }
        setReplyTarget(null);
        setInput("");
      },
      [
        input,
        isLoading,
        sendMessage,
        debugMode,
        setInput,
        runSingleStep,
        submitDisabled,
        replyTarget,
        recordReply,
      ]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (submitDisabled) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit, submitDisabled]
    );

    const handleContinue = useCallback(() => {
      const preparingToCallTaskTool = isPreparingToCallTaskTool(messages);
      continueStream(preparingToCallTaskTool);
    }, [continueStream, messages]);

    const handleRestartFromAIMessage = useCallback(
      (message: Message) => {
        if (!debugMode) return;
        const meta = getMessagesMetadata(message);
        const { parent_checkpoint: parentCheckpoint } =
          meta?.firstSeenState ?? {};
        const msgIndex = messages.findIndex((m) => m.id === message.id);
        runSingleStep(
          [],
          parentCheckpoint ?? undefined,
          false,
          messages.slice(0, msgIndex)
        );
      },
      [debugMode, runSingleStep, messages, getMessagesMetadata]
    );

    const handleRestartFromSubTask = useCallback(
      (toolCallId: string) => {
        if (!debugMode) return;
        const msgIndex = messages.findIndex(
          (m) => m.type === "tool" && m.tool_call_id === toolCallId
        );
        const meta = getMessagesMetadata(messages[msgIndex]);
        const { parent_checkpoint: parentCheckpoint } =
          meta?.firstSeenState ?? {};
        runSingleStep(
          [],
          parentCheckpoint ?? undefined,
          true,
          messages.slice(0, msgIndex)
        );
      },
      [debugMode, runSingleStep, messages, getMessagesMetadata]
    );

    // Reserved: additional UI state
    // TODO: can we make this part of the hook?
    const processedMessages = useMemo(() => {
      /*
     1. Loop through all messages
     2. For each AI message, add the AI message, and any tool calls to the messageMap
     3. For each tool message, find the corresponding tool call in the messageMap and update the status and output
    */
      const messageMap = new Map<
        string,
        { message: Message; toolCalls: ToolCall[] }
      >();
      messages.forEach((message: Message) => {
        if (message.type === "ai") {
          const toolCallsInMessage: Array<{
            id?: string;
            function?: { name?: string; arguments?: unknown };
            name?: string;
            type?: string;
            args?: unknown;
            input?: unknown;
          }> = [];
          if (
            message.additional_kwargs?.tool_calls &&
            Array.isArray(message.additional_kwargs.tool_calls)
          ) {
            toolCallsInMessage.push(...message.additional_kwargs.tool_calls);
          } else if (message.tool_calls && Array.isArray(message.tool_calls)) {
            toolCallsInMessage.push(
              ...message.tool_calls.filter(
                (toolCall: { name?: string }) => toolCall.name !== ""
              )
            );
          } else if (Array.isArray(message.content)) {
            const toolUseBlocks = message.content.filter(
              (block: { type?: string }) => block.type === "tool_use"
            );
            toolCallsInMessage.push(...toolUseBlocks);
          }
          const toolCallsWithStatus = toolCallsInMessage.map(
            (toolCall: {
              id?: string;
              function?: { name?: string; arguments?: unknown };
              name?: string;
              type?: string;
              args?: unknown;
              input?: unknown;
            }) => {
              const name =
                toolCall.function?.name ||
                toolCall.name ||
                toolCall.type ||
                "unknown";
              
              // Safely extract and parse arguments
              let args: Record<string, unknown> = {};
              try {
                const rawArgs =
                  toolCall.function?.arguments ||
                  toolCall.args ||
                  toolCall.input ||
                  {};
                
                // If args is a string, try to parse it as JSON
                if (typeof rawArgs === "string") {
                  // Use safeJsonParse to handle invalid escape sequences
                  const parsed = safeJsonParse<Record<string, unknown>>(rawArgs, null);
                  if (parsed !== null) {
                    args = parsed;
                  } else {
                    // If parsing failed, use the raw string (truncated)
                    args = { _raw: rawArgs.substring(0, 1000) };
                  }
                } else if (typeof rawArgs === "object" && rawArgs !== null) {
                  // Already an object, use as-is
                  args = rawArgs as Record<string, unknown>;
                } else {
                  args = { _value: rawArgs };
                }
              } catch (error) {
                console.warn(`Error processing tool call arguments for ${name}:`, error);
                args = { _error: "Failed to process arguments" };
              }
              
              return {
                id: toolCall.id || `tool-${Math.random()}`,
                name,
                args,
                status: interrupt ? "interrupted" : ("pending" as const),
              } as ToolCall;
            }
          );
          messageMap.set(message.id!, {
            message,
            toolCalls: toolCallsWithStatus,
          });
        } else if (message.type === "tool") {
          const toolCallId = message.tool_call_id;
          if (!toolCallId) {
            return;
          }
          for (const [, data] of messageMap.entries()) {
            const toolCallIndex = data.toolCalls.findIndex(
              (tc: ToolCall) => tc.id === toolCallId
            );
            if (toolCallIndex === -1) {
              continue;
            }
            data.toolCalls[toolCallIndex] = {
              ...data.toolCalls[toolCallIndex],
              status: "completed" as const,
              result: extractStringFromMessageContent(message),
            };
            break;
          }
        } else if (message.type === "human") {
          messageMap.set(message.id!, {
            message,
            toolCalls: [],
          });
        }
      });
      const processedArray = Array.from(messageMap.values());
      return processedArray.map((data, index) => {
        const prevMessage =
          index > 0 ? processedArray[index - 1].message : null;
        return {
          ...data,
          showAvatar: data.message.type !== prevMessage?.type,
        };
      });
    }, [messages, interrupt]);

    const toggle = !hideInternalToggle && (
      <div className="flex w-full justify-center">
        <div className="flex h-[24px] w-[134px] items-center gap-0 overflow-hidden rounded border border-[#D1D1D6] bg-white p-[3px] text-[12px] shadow-sm">
          <button
            type="button"
            onClick={() => setView("chat")}
            className={cn(
              "flex h-full flex-1 items-center justify-center truncate rounded p-[3px]",
              { "bg-[#F4F3FF]": !workflowView }
            )}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setView("workflow")}
            className={cn(
              "flex h-full flex-1 items-center justify-center truncate rounded p-[3px]",
              { "bg-[#F4F3FF]": workflowView }
            )}
          >
            Workflow
          </button>
        </div>
      </div>
    );

    if (isWorkflowView) {
      return (
        <div className="flex h-full w-full flex-col font-sans">
          {toggle}
          <div className="flex flex-1 overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden">
              {isThreadLoading && (
                <div className="absolute left-0 top-0 z-10 flex h-full w-full justify-center pt-[100px]">
                  <LoaderCircle className="flex h-[50px] w-[50px] animate-spin items-center justify-center text-primary" />
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-6 pb-4 pt-4">
                <div className="flex h-full w-full items-stretch">
                  <div className="flex h-full w-full flex-1">
                    {/* <AgentGraphVisualization
                      configurable={
                        (getMessagesMetadata(messages[messages.length - 1])
                          ?.activeAssistant?.config?.configurable as any) || {}
                      }
                      name={
                        getMessagesMetadata(messages[messages.length - 1])
                          ?.activeAssistant?.name || "Agent"
                      }
                    /> */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const groupedTodos = {
      in_progress: todos.filter((t) => t.status === "in_progress"),
      pending: todos.filter((t) => t.status === "pending"),
      completed: todos.filter((t) => t.status === "completed"),
    };

    const hasTasks = todos.length > 0;
    const hasFiles = Object.keys(files).length > 0;

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    };

    return (
      <>
        <div className="flex flex-1 flex-col overflow-hidden">
        {/* Message Search Bar */}
        {threadId && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-4 py-2">
            <MessageSearch
              messages={messages}
              onMatchFound={setHighlightedMessageId}
              onSearchQueryChange={setMessageSearchQuery}
            />
            <div className="flex items-center gap-2">
              {isServiceOnly && (
                <div className="rounded border border-dashed border-amber-500 bg-amber-50 px-3 py-1 text-xs text-amber-900">
                  This is a read-only thread from history. You can view messages
                  but not continue this conversation.
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setBookmarkDialogOpen(true)}
              >
                {bookmarkedMessages.length > 0 ? (
                  <BookmarkCheck className="h-4 w-4" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
                Bookmarks ({bookmarkedMessages.length})
              </Button>
              <Dialog
                open={threadExportDialogOpen}
                onOpenChange={setThreadExportDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                  >
                    <FileDown className="h-4 w-4" />
                    Export Thread
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Export current thread</DialogTitle>
                    <DialogDescription>
                      Choose a format to download every message in this thread.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2">
                    {(["markdown", "json", "pdf"] as ExportFormat[]).map(
                      (format) => (
                        <Button
                          key={format}
                          variant="outline"
                          onClick={() => {
                            handleThreadExport(format);
                            setThreadExportDialogOpen(false);
                          }}
                        >
                          Export as {format.toUpperCase()}
                        </Button>
                      )
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
          ref={scrollRef}
        >
          <div
            className="mx-auto w-full max-w-[1024px] px-6 pb-6 pt-4"
            ref={contentRef}
          >
            {isThreadLoading ? (
              skeleton
            ) : (
              <>
                {processedMessages.map((data, index) => {
                  const messageId = data.message.id;
                  if (!messageId) {
                    return null;
                  }
                  const messageUi = ui?.filter(
                    (u: any) => u.metadata?.message_id === data.message.id
                  );
                  const isHighlighted =
                    highlightedMessageId === data.message.id;
                  const parentId = getParentId(messageId);
                  const parentMessage = parentId
                    ? messageMap.get(parentId)
                    : undefined;
                  const parentSnippet = parentMessage
                    ? getMessageSnippet(parentMessage)
                    : undefined;
                  const replyIds = getReplyIds(messageId);
                  const replies = resolveMessagesByIds(replyIds);
                  const replyCount = getReplyCount(messageId);
                  const reactions = getReactions(messageId);
                  const isBookmarked = isMessageBookmarked(messageId);
                  const latestReply =
                    replies.length > 0 ? replies[replies.length - 1] : null;
                  return (
                    <div
                      key={messageId}
                      ref={isHighlighted ? highlightedMessageRef : null}
                      className={cn(
                        "transition-colors duration-200",
                        isHighlighted && "rounded-lg bg-yellow-100/50 dark:bg-yellow-900/20 p-2 -m-2"
                      )}
                    >
                      <ChatMessage
                        message={data.message}
                        toolCalls={data.toolCalls}
                        onRestartFromAIMessage={handleRestartFromAIMessage}
                        onRestartFromSubTask={handleRestartFromSubTask}
                        debugMode={debugMode}
                        isLoading={isLoading}
                        isLastMessage={index === processedMessages.length - 1}
                        interrupt={interrupt}
                        ui={messageUi}
                        stream={stream}
                        searchQuery={messageSearchQuery}
                        replyingToSnippet={parentSnippet}
                        onJumpToParent={
                          parentId
                            ? () => setHighlightedMessageId(parentId)
                            : undefined
                        }
                      />
                      <MessageManagementBar
                        reactions={reactions}
                        onReactionToggle={(emoji) =>
                          toggleReaction(messageId, emoji)
                        }
                        onReply={() => handleReplyInThread(data.message)}
                        replyCount={replyCount}
                        onOpenThread={() => setThreadViewerParent(data.message)}
                        isBookmarked={isBookmarked}
                        onToggleBookmark={() => toggleBookmark(messageId)}
                        onCopy={() =>
                          handleCopyWithContext(data.message, parentSnippet)
                        }
                        onExport={(format) =>
                          handleExportMessage(data.message, replies, format)
                        }
                      />
                      {latestReply && (
                        <div className="mt-2 rounded border-l-2 border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span className="font-medium">
                              Latest reply preview
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {getMessageSnippet(latestReply, 160)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {interrupt && debugMode && (
                  <div className="mt-4">
                    <Button
                      onClick={handleContinue}
                      variant="outline"
                      className="rounded-full px-3 py-1 text-xs"
                    >
                      Continue
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 bg-background">
          <div
            className={cn(
              "mx-4 mb-6 flex flex-shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background",
              "mx-auto w-[calc(100%-32px)] max-w-[1024px] transition-colors duration-200 ease-in-out"
            )}
          >
            {(hasTasks || hasFiles) && (
              <div className="flex max-h-72 flex-col overflow-y-auto border-b border-border bg-sidebar empty:hidden">
                {!metaOpen && (
                  <>
                    {(() => {
                      const activeTask = todos.find(
                        (t) => t.status === "in_progress"
                      );

                      const totalTasks = todos.length;
                      const remainingTasks =
                        totalTasks - groupedTodos.pending.length;
                      const isCompleted = totalTasks === remainingTasks;

                      const tasksTrigger = (() => {
                        if (!hasTasks) return null;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              setMetaOpen((prev) =>
                                prev === "tasks" ? null : "tasks"
                              )
                            }
                            className="grid w-full cursor-pointer grid-cols-[auto_auto_1fr] items-center gap-3 px-[18px] py-3 text-left"
                            aria-expanded={metaOpen === "tasks"}
                          >
                            {(() => {
                              if (isCompleted) {
                                return [
                                  <CheckCircle
                                    key="icon"
                                    size={16}
                                    className="text-success/80"
                                  />,
                                  <span
                                    key="label"
                                    className="ml-[1px] min-w-0 truncate text-sm"
                                  >
                                    All tasks completed
                                  </span>,
                                ];
                              }

                              if (activeTask != null) {
                                return [
                                  <div key="icon">
                                    {getStatusIcon(activeTask.status)}
                                  </div>,
                                  <span
                                    key="label"
                                    className="ml-[1px] min-w-0 truncate text-sm"
                                  >
                                    Task{" "}
                                    {totalTasks - groupedTodos.pending.length}{" "}
                                    of {totalTasks}
                                  </span>,
                                  <span
                                    key="content"
                                    className="min-w-0 gap-2 truncate text-sm text-muted-foreground"
                                  >
                                    {activeTask.content}
                                  </span>,
                                ];
                              }

                              return [
                                <Circle
                                  key="icon"
                                  size={16}
                                  className="text-tertiary/70"
                                />,
                                <span
                                  key="label"
                                  className="ml-[1px] min-w-0 truncate text-sm"
                                >
                                  Task{" "}
                                  {totalTasks - groupedTodos.pending.length} of{" "}
                                  {totalTasks}
                                </span>,
                              ];
                            })()}
                          </button>
                        );
                      })();

                      const filesTrigger = (() => {
                        if (!hasFiles) return null;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              setMetaOpen((prev) =>
                                prev === "files" ? null : "files"
                              )
                            }
                            className="flex flex-shrink-0 cursor-pointer items-center gap-2 px-[18px] py-3 text-left text-sm"
                            aria-expanded={metaOpen === "files"}
                          >
                            <FileIcon size={16} />
                            Files (State)
                            <span className="h-4 min-w-4 rounded-full bg-[#2F6868] px-0.5 text-center text-[10px] leading-[16px] text-white">
                              {Object.keys(files).length}
                            </span>
                          </button>
                        );
                      })();

                      return (
                        <div className="grid grid-cols-[1fr_auto_auto] items-center">
                          {tasksTrigger}
                          {filesTrigger}
                        </div>
                      );
                    })()}
                  </>
                )}

                {metaOpen && (
                  <>
                    <div className="sticky top-0 flex items-stretch bg-sidebar text-sm">
                      {hasTasks && (
                        <button
                          type="button"
                          className="py-3 pr-4 first:pl-[18px] aria-expanded:font-semibold"
                          onClick={() =>
                            setMetaOpen((prev) =>
                              prev === "tasks" ? null : "tasks"
                            )
                          }
                          aria-expanded={metaOpen === "tasks"}
                        >
                          Tasks
                        </button>
                      )}
                      {hasFiles && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 py-3 pr-4 first:pl-[18px] aria-expanded:font-semibold"
                          onClick={() =>
                            setMetaOpen((prev) =>
                              prev === "files" ? null : "files"
                            )
                          }
                          aria-expanded={metaOpen === "files"}
                        >
                          Files (State)
                          <span className="h-4 min-w-4 rounded-full bg-[#2F6868] px-0.5 text-center text-[10px] leading-[16px] text-white">
                            {Object.keys(files).length}
                          </span>
                        </button>
                      )}
                      <button
                        aria-label="Close"
                        className="flex-1"
                        onClick={() => setMetaOpen(null)}
                      />
                    </div>
                    <div
                      ref={tasksContainerRef}
                      className="px-[18px]"
                    >
                      {metaOpen === "tasks" &&
                        Object.entries(groupedTodos)
                          .filter(([_, todos]) => todos.length > 0)
                          .map(([status, todos]) => (
                            <div
                              key={status}
                              className="mb-4"
                            >
                              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                                {
                                  {
                                    pending: "Pending",
                                    in_progress: "In Progress",
                                    completed: "Completed",
                                  }[status]
                                }
                              </h3>
                              <div className="grid grid-cols-[auto_1fr] gap-3 rounded-sm p-1 pl-0 text-sm">
                                {todos.map((todo, index) => (
                                  <Fragment
                                    key={`${status}_${todo.id}_${index}`}
                                  >
                                    {getStatusIcon(todo.status, "mt-0.5")}
                                    <span className="break-words text-inherit">
                                      {todo.content}
                                    </span>
                                  </Fragment>
                                ))}
                              </div>
                            </div>
                          ))}

                      {metaOpen === "files" && (
                        <div className="mb-6">
                          <FilesPopover
                            files={files}
                            setFiles={setFiles}
                            editDisabled={
                              isLoading === true || interrupt !== undefined
                            }
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            <form
              onSubmit={handleSubmit}
              className="flex flex-col"
            >
              {replyTarget && (
                <div className="flex items-start justify-between border-b border-border/60 bg-muted/30 px-[18px] py-3 text-sm text-muted-foreground">
                  <div className="pr-3">
                    <p className="text-xs font-semibold uppercase text-tertiary">
                      Replying to {replyTarget.type === "human" ? "User" : "Assistant"}
                    </p>
                    <p className="text-sm text-primary">
                      {getMessageSnippet(replyTarget, 180)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setReplyTarget(null)}
                    aria-label="Cancel reply"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isLoading ? "Running..." : "Write your message..."}
                className="font-inherit field-sizing-content flex-1 resize-none border-0 bg-transparent px-[18px] pb-[13px] pt-[14px] text-sm leading-7 text-primary outline-none placeholder:text-tertiary"
                rows={1}
              />
              <div className="flex justify-between gap-2 p-3">
                <div className="flex items-center gap-2">{controls}</div>

                <div className="flex justify-end gap-2">
                  <Button
                    type={isLoading ? "button" : "submit"}
                    variant={isLoading ? "destructive" : "default"}
                    onClick={isLoading ? stopStream : handleSubmit}
                    disabled={!isLoading && (submitDisabled || !input.trim())}
                  >
                    {isLoading ? (
                      <>
                        <Square size={14} />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <ArrowUp size={18} />
                        <span>Send</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
          {banner && (
            <div className="mx-auto mb-3 mt-3 w-[calc(100%-32px)] max-w-[512px]">
              {banner}
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={Boolean(threadViewerParent)}
        onOpenChange={(open) => {
          if (!open) {
            setThreadViewerParent(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Thread details</DialogTitle>
            <DialogDescription>
              View replies linked to this message.
            </DialogDescription>
          </DialogHeader>
          {threadViewerParent && (
            <div className="space-y-4">
              <div className="rounded border bg-muted/40 p-4 text-sm">
                <p className="font-semibold text-primary">
                  {getMessageSnippet(threadViewerParent, 220)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (threadViewerParent.id) {
                        setHighlightedMessageId(threadViewerParent.id);
                      }
                      setThreadViewerParent(null);
                    }}
                  >
                    Jump to message
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleReplyInThread(threadViewerParent)}
                  >
                    Reply in thread
                  </Button>
                </div>
              </div>
              <ScrollArea className="max-h-[60vh] pr-3">
                {threadReplies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No replies yet. Be the first to add one.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {threadReplies.map((reply) => (
                      <div
                        key={reply.id}
                        className="rounded border bg-background p-3 text-sm"
                      >
                        <p className="font-semibold text-primary">
                          {getMessageSnippet(reply, 200)}
                        </p>
                        <div className="mt-2 flex gap-2">
                          {reply.id && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setHighlightedMessageId(reply.id!);
                                setThreadViewerParent(null);
                              }}
                            >
                              Jump
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={bookmarkDialogOpen}
        onOpenChange={setBookmarkDialogOpen}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Bookmarked messages</DialogTitle>
            <DialogDescription>
              Jump back to important highlights in this conversation.
            </DialogDescription>
          </DialogHeader>
          {bookmarkedMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t bookmarked any messages yet.
            </p>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-3">
                {bookmarkedMessages.map((message) => (
                  <div
                    key={message.id}
                    className="rounded border bg-muted/30 p-3 text-sm"
                  >
                    <p className="font-semibold text-primary">
                      {getMessageSnippet(message, 220)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setHighlightedMessageId(message.id!);
                            setBookmarkDialogOpen(false);
                          }}
                        >
                          Jump
                        </Button>
                      )}
                      {message.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleBookmark(message.id!)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
      </>
    );
  }
);

ChatInterface.displayName = "ChatInterface";
