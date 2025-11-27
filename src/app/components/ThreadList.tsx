"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { Loader2, MessageSquare, X, Pin, Folder, Tag as TagIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ThreadItem } from "@/app/hooks/useThreads";
import { useThreads } from "@/app/hooks/useThreads";
import { ThreadSearch } from "@/app/components/ThreadSearch";
import { AdvancedFilters, type FilterState } from "@/app/components/AdvancedFilters";
import { searchMultipleFields } from "@/app/utils/searchUtils";
import {
  getThreadMetadata,
  getAllFolders,
  getAllTags,
} from "@/lib/threadMetadata";
import { ThreadActions } from "@/app/components/ThreadActions";
import { useClient } from "@/providers/ClientProvider";
import { getConfig } from "@/lib/config";
import { useAuth } from "@/providers/AuthProvider";
import useSWR from "swr";
import { getThreadServiceBaseUrl, isValidUUID } from "@/lib/threadServiceConfig";

type StatusFilter = "all" | "idle" | "busy" | "interrupted" | "error" | "completed";

const GROUP_LABELS = {
  interrupted: "Requiring Attention",
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  older: "Older",
} as const;

const STATUS_COLORS: Record<ThreadItem["status"], string> = {
  idle: "bg-green-500",
  busy: "bg-blue-500",
  interrupted: "bg-orange-500",
  error: "bg-red-600",
  // Note: "completed" is an alias for "idle" in the filter
};

function getThreadColor(status: ThreadItem["status"]): string {
  return STATUS_COLORS[status] ?? "bg-gray-400";
}

function formatTime(date: Date, now = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return format(date, "HH:mm");
  if (days === 1) return "Yesterday";
  if (days < 7) return format(date, "EEEE");
  return format(date, "MM/dd");
}

function StatusFilterItem({
  status,
  label,
  badge,
}: {
  status: ThreadItem["status"];
  label: string;
  badge?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "inline-block size-2 rounded-full",
          getThreadColor(status)
        )}
      />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
          {badge}
        </span>
      )}
    </span>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <p className="text-sm text-red-600">Failed to load threads</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-16 w-full"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <MessageSquare className="mb-2 h-12 w-12 text-gray-300" />
      <p className="text-sm text-muted-foreground">No threads found</p>
    </div>
  );
}

interface ThreadItemProps {
  thread: ThreadItem;
  metadata: ReturnType<typeof getThreadMetadata>;
  isSelected: boolean;
  onSelect: () => void;
  onMetadataChange?: () => void;
  index: number;
  isFocused: boolean;
}

function ThreadItem({
  thread,
  metadata,
  isSelected,
  onSelect,
  onMetadataChange,
  index,
  isFocused,
}: ThreadItemProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      data-thread-id={thread.id}
      className={cn(
        "group relative grid w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-200",
        "hover:bg-accent",
        isSelected
          ? "border border-primary bg-accent hover:bg-accent"
          : "border border-transparent bg-transparent",
        isFocused && "ring-2 ring-ring ring-offset-2"
      )}
      onClick={onSelect}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      aria-current={isSelected}
      role="button"
      tabIndex={-1}
    >
      <div className="min-w-0 flex-1">
        {/* Title + Timestamp Row */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {metadata.pinned && (
              <Pin className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            )}
            {metadata.folder && (
              <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            )}
            <h3 className="truncate text-sm font-semibold">
              {thread.title}
            </h3>
          </div>
          <span className="ml-2 flex-shrink-0 text-xs text-muted-foreground">
            {formatTime(thread.updatedAt)}
          </span>
        </div>
        {/* Description + Status Row */}
        <div className="flex items-center justify-between gap-2">
          <p className="flex-1 truncate text-sm text-muted-foreground">
            {thread.description}
          </p>
          <div className="ml-2 flex items-center gap-2 flex-shrink-0">
            {metadata.tags.length > 0 && (
              <div className="flex items-center gap-1">
                <TagIcon className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {metadata.tags.length}
                </span>
              </div>
            )}
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                getThreadColor(thread.status)
              )}
            />
          </div>
        </div>
        {/* Tags display */}
        {metadata.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {metadata.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4"
              >
                {tag}
              </Badge>
            ))}
            {metadata.tags.length > 3 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4"
              >
                +{metadata.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
      {showActions && (
        <div
          className="absolute right-2 top-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <ThreadActions
            threadId={thread.id}
            onMetadataChange={onMetadataChange}
          />
        </div>
      )}
    </div>
  );
}

interface ThreadListProps {
  onThreadSelect: (id: string) => void;
  onMutateReady?: (mutate: () => void) => void;
  onClose?: () => void;
  onInterruptCountChange?: (count: number) => void;
}

export function ThreadList({
  onThreadSelect,
  onMutateReady,
  onClose,
  onInterruptCountChange,
}: ThreadListProps) {
  const [currentThreadId] = useQueryState("threadId");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>({});
  const [showArchived, setShowArchived] = useState(false);
  const [groupByFolder, setGroupByFolder] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [metadataVersion, setMetadataVersion] = useState(0);
  const threadListRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const client = useClient();
  const config = getConfig();
  const { accessToken } = useAuth();

  const threads = useThreads({
    // Map "completed" to "idle" since LangGraph uses "idle" for completed threads
    status: statusFilter === "all" 
      ? undefined 
      : statusFilter === "completed" 
        ? "idle" 
        : statusFilter,
    limit: 20,
  });

  // Fetch current thread if it's not in the search results
  const { data: currentThreadData } = useSWR(
    currentThreadId && config
      ? ["current-thread", currentThreadId, config.deploymentUrl]
      : null,
    async () => {
      if (!currentThreadId || !config) return null;
      
      // Check if thread is already in the flattened list
      const flattened = threads.data?.flat() ?? [];
      if (flattened.some((t) => t.id === currentThreadId)) {
        return null; // Already in list, no need to add
      }
      
      // Determine the actual LangGraph thread ID to use
      let langgraphThreadId = currentThreadId;
      
      // If currentThreadId looks like a UUID (thread service ID), try to get langgraph_thread_id
      if (isValidUUID(currentThreadId)) {
        // This might be a thread service UUID, try to fetch from thread service to get langgraph_thread_id
        const threadServiceUrl = getThreadServiceBaseUrl();
        
        if (threadServiceUrl && accessToken) {
          try {
            const response = await fetch(`${threadServiceUrl}/threads/${currentThreadId}`, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            });
            
            if (response.ok) {
              const threadData = await response.json();
              const langgraphId = threadData.metadata?.langgraph_thread_id;
              if (langgraphId) {
                langgraphThreadId = langgraphId;
                console.log(`[ThreadService] Resolved thread service UUID ${currentThreadId} to LangGraph ID ${langgraphThreadId}`);
              } else {
                // Thread exists in thread service but has no LangGraph ID - can't fetch from LangGraph
                console.warn(`[ThreadService] Thread ${currentThreadId} exists in thread service but has no langgraph_thread_id, cannot fetch from LangGraph`);
                return null;
              }
            } else if (response.status === 404) {
              // Thread doesn't exist in thread service - might be a LangGraph-only thread
              // This is expected for threads that were never persisted or were created before persistence was enabled
              // Silently continue to try LangGraph with original ID
            } else {
              console.warn(`[ThreadService] Failed to fetch thread ${currentThreadId} from thread service: ${response.status} ${response.statusText}`);
              // Continue to try LangGraph with original ID
            }
          } catch (error) {
            console.warn(`[ThreadService] Error fetching thread ${currentThreadId} from thread service:`, error);
            // Continue to try LangGraph with original ID
          }
        }
      }
      
      try {
        // Try to get thread state using the LangGraph thread ID
        const state = await client.threads.getState(langgraphThreadId);
        
        if (!state) return null;

        // Convert to ThreadItem format
        let title = "Untitled Thread";
        let description = "";

        try {
          if (state.values && typeof state.values === "object") {
            const values = state.values as any;
            const firstHumanMessage = values.messages?.find(
              (m: any) => m.type === "human"
            );
            if (firstHumanMessage?.content) {
              const content =
                typeof firstHumanMessage.content === "string"
                  ? firstHumanMessage.content
                  : firstHumanMessage.content[0]?.text || "";
              title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
            }
            const firstAiMessage = values.messages?.find(
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
          title = `Thread ${currentThreadId.slice(0, 8)}`;
        }

        // Get updatedAt from thread metadata or use current time
        // Note: ThreadState doesn't have direct status/checkpoint access
        // We'll use the thread's updated_at if available, otherwise current time
        const updatedAt = new Date();

        return {
          id: langgraphThreadId, // Use the LangGraph thread ID, not the original currentThreadId
          updatedAt,
          status: "idle" as const, // Default to idle since we can't determine status from getState
          title,
          description,
          assistantId: config.assistantId,
        } as ThreadItem;
      } catch (error: any) {
        // Thread might not exist or be accessible
        // Check if it's a 404 error - this is expected for threads that don't exist in LangGraph
        const is404 = error?.message?.includes("404") || 
                     error?.status === 404 || 
                     error?.response?.status === 404 ||
                     (error?.message && error.message.includes("not found"));
        
        if (is404) {
          // Thread doesn't exist in LangGraph - this is expected for thread service-only threads
          // Silently return null - don't log as an error
          return null;
        } else {
          // Other errors - log for debugging
          console.warn(`[LangGraph] Error fetching thread ${langgraphThreadId}:`, error);
          return null;
        }
      }
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  const flattened = useMemo(() => {
    const baseThreads = threads.data?.flat() ?? [];
    
    // Add current thread if it exists and isn't already in the list
    if (currentThreadData && !baseThreads.some((t) => t.id === currentThreadData.id)) {
      return [currentThreadData, ...baseThreads];
    }
    
    return baseThreads;
  }, [threads.data, currentThreadData]);

  // Apply search, filters, and metadata
  const filteredThreads = useMemo(() => {
    let filtered = flattened;

    // Filter by archived status
    if (!showArchived) {
      filtered = filtered.filter((thread) => {
        const metadata = getThreadMetadata(thread.id);
        return !metadata.archived;
      });
    }

    // Filter by folder if selected
    if (selectedFolder) {
      filtered = filtered.filter((thread) => {
        const metadata = getThreadMetadata(thread.id);
        return metadata.folder === selectedFolder;
      });
    }

    // Apply search query (including tags)
    if (searchQuery.trim()) {
      filtered = filtered.filter((thread) => {
        const metadata = getThreadMetadata(thread.id);
        const tagMatch = metadata.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        );
        const contentMatch = searchMultipleFields(thread, searchQuery, [
          "title",
          "description",
          "status",
          (t) => t.updatedAt.toISOString(),
        ]);
        return tagMatch || contentMatch;
      });
    }

    // Apply advanced filters
    if (advancedFilters.status) {
      // Handle "completed" as alias for "idle" since LangGraph uses "idle" for completed threads
      const filterStatus = advancedFilters.status === "completed" ? "idle" : advancedFilters.status;
      filtered = filtered.filter((t) => t.status === filterStatus);
    }

    if (advancedFilters.dateRange) {
      const { start, end } = advancedFilters.dateRange;
      filtered = filtered.filter((thread) => {
        const threadDate = thread.updatedAt.getTime();
        if (start && threadDate < start.getTime()) return false;
        if (end && threadDate > end.getTime()) return false;
        return true;
      });
    }

    if (advancedFilters.assistantId) {
      filtered = filtered.filter(
        (t) => t.assistantId === advancedFilters.assistantId
      );
    }

    // Sort: pinned first, then by updatedAt
    filtered.sort((a, b) => {
      const aMeta = getThreadMetadata(a.id);
      const bMeta = getThreadMetadata(b.id);
      if (aMeta.pinned && !bMeta.pinned) return -1;
      if (!aMeta.pinned && bMeta.pinned) return 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    return filtered;
  }, [flattened, searchQuery, advancedFilters, showArchived, selectedFolder, metadataVersion]);

  const isLoadingMore =
    threads.size > 0 && threads.data?.[threads.size - 1] == null;
  const isEmpty = threads.data?.at(0)?.length === 0;
  const isReachingEnd = isEmpty || (threads.data?.at(-1)?.length ?? 0) < 20;

  // Automatically load additional pages when the user expects to see completed
  // threads (idle status) but the current result set doesn't include any.
  useEffect(() => {
    const expectsCompleted =
      statusFilter === "all" ||
      statusFilter === "completed" ||
      advancedFilters.status === "completed";

    if (!expectsCompleted) return;
    if (threads.isLoading || isLoadingMore) return;
    if (isReachingEnd) return;

    const hasCompletedThread = filteredThreads.some(
      (thread) => thread.status === "idle"
    );

    if (!hasCompletedThread) {
      threads.setSize(threads.size + 1);
    }
  }, [
    statusFilter,
    advancedFilters.status,
    filteredThreads,
    threads.isLoading,
    threads.setSize,
    threads.size,
    isReachingEnd,
    isLoadingMore,
  ]);

  // Group threads by folder or time and status
  const grouped = useMemo(() => {
    if (groupByFolder) {
      const folderGroups: Record<string, ThreadItem[]> = {};
      const pinned: ThreadItem[] = [];
      const noFolder: ThreadItem[] = [];

      filteredThreads.forEach((thread) => {
        const metadata = getThreadMetadata(thread.id);
        if (metadata.pinned) {
          pinned.push(thread);
        } else if (metadata.folder) {
          if (!folderGroups[metadata.folder]) {
            folderGroups[metadata.folder] = [];
          }
          folderGroups[metadata.folder].push(thread);
        } else {
          noFolder.push(thread);
        }
      });

      return { type: "folder" as const, folderGroups, pinned, noFolder };
    }

    const now = new Date();
    const groups: Record<keyof typeof GROUP_LABELS, ThreadItem[]> = {
      interrupted: [],
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };

    filteredThreads.forEach((thread) => {
      const metadata = getThreadMetadata(thread.id);
      // Pinned threads are already sorted first, so we skip them here
      if (metadata.pinned) {
        return;
      }

      if (thread.status === "interrupted") {
        groups.interrupted.push(thread);
        return;
      }

      const diff = now.getTime() - thread.updatedAt.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) {
        groups.today.push(thread);
      } else if (days === 1) {
        groups.yesterday.push(thread);
      } else if (days < 7) {
        groups.week.push(thread);
      } else {
        groups.older.push(thread);
      }
    });

    return { type: "time" as const, groups };
  }, [filteredThreads, groupByFolder]);

  const interruptedCount = useMemo(() => {
    return flattened.filter((t) => t.status === "interrupted").length;
  }, [flattened]);

  // Get unique assistant IDs for filter
  const assistantIds = useMemo(() => {
    return Array.from(
      new Set(flattened.map((t) => t.assistantId).filter(Boolean) as string[])
    );
  }, [flattened]);

  // Expose thread list revalidation to parent component
  // Use refs to create a stable callback that always calls the latest mutate function
  const onMutateReadyRef = useRef(onMutateReady);
  const onInterruptCountChangeRef = useRef(onInterruptCountChange);
  const threadsRef = useRef(threads);
  // Preserve thread list size when threadId changes (e.g., when clicking "New Thread")
  // This prevents the list from resetting to size 1 when navigating away from a thread
  const preservedSizeRef = useRef<number | null>(null);

  // Update refs when callbacks change - use separate effects to ensure stable dependency arrays
  useEffect(() => {
    onMutateReadyRef.current = onMutateReady;
  }, [onMutateReady]);

  useEffect(() => {
    onInterruptCountChangeRef.current = onInterruptCountChange;
  }, [onInterruptCountChange]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads.mutate, threads.setSize, threads.size, threads.data]);

  // Store the current size whenever we have valid data
  useEffect(() => {
    if (threads.size > 0 && threads.data && threads.data.length > 0) {
      preservedSizeRef.current = threads.size;
    }
  }, [threads.size, threads.data]);

  const mutateFn = useCallback(() => {
    // Preserve the current size when revalidating to prevent threads from disappearing
    // Read size directly from threads to get the latest value
    const currentThreads = threadsRef.current;
    // Use preserved size if available, otherwise use current size
    const currentSize = preservedSizeRef.current ?? currentThreads.size;
    
    if (currentThreads.mutate && currentSize > 0) {
      // For useSWRInfinite, mutate() should preserve existing pages
      // Set size before mutating to ensure it's maintained
      if (currentThreads.setSize) {
        currentThreads.setSize(currentSize);
        preservedSizeRef.current = currentSize;
      }
      
      // Call mutate to revalidate - this should preserve existing pages
      currentThreads.mutate();
      
      // Single check after a short delay to restore size if it was reset
      // This is a safeguard in case mutate() resets the size
      const checkAndRestoreSize = () => {
        const latestThreads = threadsRef.current;
        if (latestThreads.setSize && latestThreads.size < currentSize) {
          latestThreads.setSize(currentSize);
          preservedSizeRef.current = currentSize;
        }
      };
      
      // Use requestAnimationFrame for immediate check, then one timeout as backup
      requestAnimationFrame(checkAndRestoreSize);
      setTimeout(checkAndRestoreSize, 100);
    } else if (currentThreads.mutate) {
      // If size is 0 or undefined, just call mutate normally
      currentThreads.mutate();
    }
  }, []);

  useEffect(() => {
    onMutateReadyRef.current?.(mutateFn);
    // Only run once on mount to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When threadId changes, ensure we maintain the preserved size
  useEffect(() => {
    // When threadId changes, ensure we maintain the preserved size
    if (preservedSizeRef.current !== null && threads.setSize) {
      const targetSize = preservedSizeRef.current;
      // Only restore if current size is smaller (meaning it was reset)
      if (threads.size < targetSize) {
        threads.setSize(targetSize);
      }
    }
  }, [currentThreadId, threads.size, threads.setSize]);

  // Notify parent of interrupt count changes
  // Use ref to avoid dependency on callback, preventing infinite loops
  // Track previous value to only notify when count actually changes
  const prevInterruptCountRef = useRef<number | null>(null);
  useEffect(() => {
    // Only call callback if the count actually changed (skip initial render if value is 0)
    const prevCount = prevInterruptCountRef.current;
    if (prevCount !== interruptedCount) {
      prevInterruptCountRef.current = interruptedCount;
      if (onInterruptCountChangeRef.current) {
        onInterruptCountChangeRef.current(interruptedCount);
      }
    }
  }, [interruptedCount]);

  // Collect all rendered thread IDs for keyboard navigation
  const renderedThreadIds = useMemo(() => {
    const ids: string[] = [];
    if (grouped.type === "folder") {
      grouped.pinned.forEach((t) => ids.push(t.id));
      Object.values(grouped.folderGroups).forEach((threads) => {
        threads.forEach((t) => ids.push(t.id));
      });
      grouped.noFolder.forEach((t) => ids.push(t.id));
    } else {
      // Pinned first
      filteredThreads
        .filter((t) => getThreadMetadata(t.id).pinned)
        .forEach((t) => ids.push(t.id));
      // Then time-based groups
      (
        Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>
      ).forEach((group) => {
        const groupThreads = grouped.groups[group];
        groupThreads.forEach((t) => ids.push(t.id));
      });
    }
    return ids;
  }, [grouped, filteredThreads]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if thread list is focused or no input is focused
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (renderedThreadIds.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, renderedThreadIds.length - 1);
          // Scroll into view
          setTimeout(() => {
            const threadElement = threadListRef.current?.querySelector(
              `[data-thread-id="${renderedThreadIds[next]}"]`
            );
            if (threadElement) {
              threadElement.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? renderedThreadIds.length - 1 : Math.max(prev - 1, 0);
          // Scroll into view
          setTimeout(() => {
            const threadElement = threadListRef.current?.querySelector(
              `[data-thread-id="${renderedThreadIds[next]}"]`
            );
            if (threadElement) {
              threadElement.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
          return next;
        });
      } else if (e.key === "Enter" && focusedIndex !== null) {
        e.preventDefault();
        const threadId = renderedThreadIds[focusedIndex];
        if (threadId) {
          onThreadSelect(threadId);
        }
      } else if (e.key === "Escape") {
        setFocusedIndex(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [renderedThreadIds, focusedIndex, onThreadSelect]);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header with title, filter, and close button */}
      <div className="flex flex-shrink-0 flex-col border-b border-border">
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 p-4">
          <h2 className="text-lg font-semibold tracking-tight">Threads</h2>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Active</SelectLabel>
                  <SelectItem value="idle">
                    <StatusFilterItem
                      status="idle"
                      label="Idle (Completed)"
                    />
                  </SelectItem>
                  <SelectItem value="completed">
                    <StatusFilterItem
                      status="idle"
                      label="Completed"
                    />
                  </SelectItem>
                  <SelectItem value="busy">
                    <StatusFilterItem
                      status="busy"
                      label="Busy"
                    />
                  </SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Attention</SelectLabel>
                  <SelectItem value="interrupted">
                    <StatusFilterItem
                      status="interrupted"
                      label="Interrupted"
                      badge={interruptedCount}
                    />
                  </SelectItem>
                  <SelectItem value="error">
                    <StatusFilterItem
                      status="error"
                      label="Error"
                    />
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
                aria-label="Close threads sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {/* Search and Advanced Filters */}
        <div className="flex items-center gap-2 px-4 pb-4">
          <ThreadSearch
            threads={filteredThreads}
            onSearchChange={setSearchQuery}
            className="flex-1"
          />
          <AdvancedFilters
            filters={advancedFilters}
            onFiltersChange={setAdvancedFilters}
            availableAssistantIds={assistantIds}
          />
        </div>
        {/* Organization Controls */}
        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="show-archived"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label
                htmlFor="show-archived"
                className="text-xs cursor-pointer"
              >
                Show Archived
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="group-by-folder"
                checked={groupByFolder}
                onCheckedChange={setGroupByFolder}
              />
              <Label
                htmlFor="group-by-folder"
                className="text-xs cursor-pointer"
              >
                Group by Folder
              </Label>
            </div>
          </div>
          {groupByFolder && (
            <Select
              value={selectedFolder || "all"}
              onValueChange={(v) => setSelectedFolder(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All folders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All folders</SelectItem>
                {getAllFolders().map((folder) => (
                  <SelectItem
                    key={folder}
                    value={folder}
                  >
                    {folder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <ScrollArea className="h-0 flex-1">
        <div className="pb-6">
          {threads.error && <ErrorState message={threads.error.message} />}

        {!threads.error && !threads.data && threads.isLoading && (
          <LoadingState />
        )}

        {!threads.error &&
          !threads.isLoading &&
          isEmpty &&
          !searchQuery &&
          !advancedFilters.status &&
          !advancedFilters.dateRange &&
          !advancedFilters.assistantId && <EmptyState />}
        {!threads.error &&
          !threads.isLoading &&
          filteredThreads.length === 0 &&
          (searchQuery ||
            advancedFilters.status ||
            advancedFilters.dateRange ||
            advancedFilters.assistantId) && (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="mb-2 h-12 w-12 text-gray-300" />
              <p className="text-sm text-muted-foreground">
                No threads match your filters
              </p>
            </div>
          )}

        {!threads.error && !isEmpty && (
          <div
            ref={threadListRef}
            className="box-border w-full max-w-full overflow-hidden px-2 pt-2 pb-6"
            tabIndex={0}
          >
            {grouped.type === "folder" ? (
              <>
                {/* Pinned threads */}
                {grouped.pinned.length > 0 && (
                  <div className="mb-4">
                    <h4 className="m-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </h4>
                    <div className="flex flex-col gap-1">
                        {grouped.pinned.map((thread) => {
                          const metadata = getThreadMetadata(thread.id);
                          const globalIndex = renderedThreadIds.indexOf(thread.id);
                          return (
                            <ThreadItem
                              key={thread.id}
                              thread={thread}
                              metadata={metadata}
                              isSelected={currentThreadId === thread.id}
                              onSelect={() => onThreadSelect(thread.id)}
                              onMetadataChange={() => setMetadataVersion((v) => v + 1)}
                              index={globalIndex}
                              isFocused={focusedIndex === globalIndex}
                            />
                          );
                        })}
                    </div>
                  </div>
                )}
                {/* Folder groups */}
                {Object.entries(grouped.folderGroups).map(([folder, folderThreads]) => (
                  <div
                    key={folder}
                    className="mb-4"
                  >
                    <h4 className="m-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                      <Folder className="h-3 w-3" />
                      {folder}
                    </h4>
                    <div className="flex flex-col gap-1">
                      {folderThreads.map((thread) => {
                        const metadata = getThreadMetadata(thread.id);
                        const globalIndex = renderedThreadIds.indexOf(thread.id);
                        return (
                          <ThreadItem
                            key={thread.id}
                            thread={thread}
                            metadata={metadata}
                            isSelected={currentThreadId === thread.id}
                            onSelect={() => onThreadSelect(thread.id)}
                            onMetadataChange={() => setMetadataVersion((v) => v + 1)}
                            index={globalIndex}
                            isFocused={focusedIndex === globalIndex}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* No folder */}
                {grouped.noFolder.length > 0 && (
                  <div className="mb-4">
                    <h4 className="m-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      No Folder
                    </h4>
                    <div className="flex flex-col gap-1">
                      {grouped.noFolder.map((thread) => {
                        const metadata = getThreadMetadata(thread.id);
                        const globalIndex = renderedThreadIds.indexOf(thread.id);
                        return (
                          <ThreadItem
                            key={thread.id}
                            thread={thread}
                            metadata={metadata}
                            isSelected={currentThreadId === thread.id}
                            onSelect={() => onThreadSelect(thread.id)}
                            onMetadataChange={() => setMetadataVersion((v) => v + 1)}
                            index={globalIndex}
                            isFocused={focusedIndex === globalIndex}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Pinned threads section */}
                {filteredThreads.filter((t) => getThreadMetadata(t.id).pinned).length > 0 && (
                  <div className="mb-4">
                    <h4 className="m-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </h4>
                    <div className="flex flex-col gap-1">
                      {filteredThreads
                        .filter((t) => getThreadMetadata(t.id).pinned)
                        .map((thread) => {
                          const metadata = getThreadMetadata(thread.id);
                          const globalIndex = renderedThreadIds.indexOf(thread.id);
                          return (
                            <ThreadItem
                              key={thread.id}
                              thread={thread}
                              metadata={metadata}
                              isSelected={currentThreadId === thread.id}
                              onSelect={() => onThreadSelect(thread.id)}
                              onMetadataChange={() => setMetadataVersion((v) => v + 1)}
                              index={globalIndex}
                              isFocused={focusedIndex === globalIndex}
                            />
                          );
                        })}
                    </div>
                  </div>
                )}
                {/* Time-based groups */}
                {(
                  Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>
                ).map((group) => {
                  const groupThreads = grouped.groups[group];
                  if (groupThreads.length === 0) return null;

                  return (
                    <div
                      key={group}
                      className="mb-4"
                    >
                      <h4 className="m-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {GROUP_LABELS[group]}
                      </h4>
                      <div className="flex flex-col gap-1">
                        {groupThreads.map((thread) => {
                          const metadata = getThreadMetadata(thread.id);
                          const globalIndex = renderedThreadIds.indexOf(thread.id);
                          return (
                            <ThreadItem
                              key={thread.id}
                              thread={thread}
                              metadata={metadata}
                              isSelected={currentThreadId === thread.id}
                              onSelect={() => onThreadSelect(thread.id)}
                              onMetadataChange={() => setMetadataVersion((v) => v + 1)}
                              index={globalIndex}
                              isFocused={focusedIndex === globalIndex}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {!isReachingEnd && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => threads.setSize(threads.size + 1)}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load More"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
        </div>
      </ScrollArea>
    </div>
  );
}
