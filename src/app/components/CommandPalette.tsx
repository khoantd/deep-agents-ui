"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryState } from "nuqs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search, MessageSquare, Clock, ArrowRight } from "lucide-react";
import type { ThreadItem } from "@/app/hooks/useThreads";
import { useThreads } from "@/app/hooks/useThreads";
import { searchText, searchMultipleFields } from "@/app/utils/searchUtils";
import { format } from "date-fns";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThreadSelect: (threadId: string) => void;
}

interface SearchResult {
  type: "thread";
  item: ThreadItem;
  matchScore: number;
}

export function CommandPalette({
  open,
  onOpenChange,
  onThreadSelect,
}: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [, setThreadId] = useQueryState("threadId");

  // Fetch all threads for search
  const threads = useThreads({ limit: 100 });

  const flattened = useMemo(() => {
    return threads.data?.flat() ?? [];
  }, [threads.data]);

  // Search and rank results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return flattened.slice(0, 10).map(
        (thread): SearchResult => ({
          type: "thread",
          item: thread,
          matchScore: 0,
        })
      );
    }

    const results: SearchResult[] = [];

    flattened.forEach((thread) => {
      let matchScore = 0;
      const query = searchQuery.toLowerCase();

      // Title match (highest priority)
      if (thread.title.toLowerCase().includes(query)) {
        matchScore += 10;
        if (thread.title.toLowerCase().startsWith(query)) {
          matchScore += 5;
        }
      }

      // Description match
      if (thread.description.toLowerCase().includes(query)) {
        matchScore += 5;
      }

      // Status match
      if (thread.status.toLowerCase().includes(query)) {
        matchScore += 2;
      }

      // Date match
      const dateStr = format(thread.updatedAt, "MMM d, yyyy").toLowerCase();
      if (dateStr.includes(query)) {
        matchScore += 1;
      }

      if (matchScore > 0) {
        results.push({
          type: "thread",
          item: thread,
          matchScore,
        });
      }
    });

    // Sort by match score (descending)
    return results.sort((a, b) => b.matchScore - a.matchScore).slice(0, 10);
  }, [flattened, searchQuery]);

  const handleSelect = useCallback(
    (threadId: string) => {
      setThreadId(threadId);
      onThreadSelect(threadId);
      onOpenChange(false);
      setSearchQuery("");
      setSelectedIndex(0);
    },
    [setThreadId, onThreadSelect, onOpenChange]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter" && searchResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(searchResults[selectedIndex].item.id);
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, searchResults, selectedIndex, handleSelect, onOpenChange]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        className="max-w-2xl p-0"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Search Threads</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search threads by title, description, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="max-h-[400px] px-6 pb-6">
          {searchResults.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {searchQuery.trim()
                ? "No threads found matching your search"
                : "Start typing to search threads..."}
            </div>
          ) : (
            <div className="space-y-1">
              {searchResults.map((result, index) => {
                const thread = result.item;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => handleSelect(thread.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      "hover:bg-accent",
                      selectedIndex === index
                        ? "border-primary bg-accent"
                        : "border-transparent"
                    )}
                  >
                    <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="truncate text-sm font-semibold">
                          {thread.title}
                        </h4>
                        <span className="ml-2 flex-shrink-0 text-xs text-muted-foreground">
                          {format(thread.updatedAt, "MMM d")}
                        </span>
                      </div>
                      {thread.description && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {thread.description}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="border-t px-6 py-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Navigate with ↑↓, select with Enter, close with Esc</span>
            <span className="flex items-center gap-4">
              <kbd className="rounded border bg-muted px-2 py-1 font-mono text-xs">
                ⌘K
              </kbd>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

