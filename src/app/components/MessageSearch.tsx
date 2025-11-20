"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchText, highlightText } from "@/app/utils/searchUtils";
import type { Message } from "@langchain/langgraph-sdk";
import { extractStringFromMessageContent } from "@/app/utils/utils";

interface MessageSearchProps {
  messages: Message[];
  onMatchFound?: (messageId: string | null) => void;
  onSearchQueryChange?: (query: string) => void;
  className?: string;
}

export function MessageSearch({
  messages,
  onMatchFound,
  onSearchQueryChange,
  className,
}: MessageSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  // Notify parent of search query changes
  useEffect(() => {
    onSearchQueryChange?.(searchQuery);
  }, [searchQuery, onSearchQueryChange]);

  // Find all matching messages
  const matchingMessages = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }

    return messages
      .map((message, index) => {
        const content = extractStringFromMessageContent(message);
        if (searchText(content, searchQuery)) {
          return { message, index };
        }
        return null;
      })
      .filter((item): item is { message: Message; index: number } => item !== null);
  }, [messages, searchQuery]);

  // Navigate to match
  const navigateToMatch = useCallback(
    (direction: "next" | "prev") => {
      if (matchingMessages.length === 0) return;

      setCurrentMatchIndex((prev) => {
        if (direction === "next") {
          const next = prev + 1;
          return next >= matchingMessages.length ? 0 : next;
        } else {
          const prev = prev - 1;
          return prev < 0 ? matchingMessages.length - 1 : prev;
        }
      });
    },
    [matchingMessages.length]
  );

  // Notify parent of current match
  useEffect(() => {
    if (matchingMessages.length > 0 && currentMatchIndex >= 0) {
      const match = matchingMessages[currentMatchIndex];
      onMatchFound?.(match.message.id ?? null);
    } else {
      onMatchFound?.(null);
    }
  }, [matchingMessages, currentMatchIndex, onMatchFound]);

  // Reset match index when search changes, but select first match if available
  useEffect(() => {
    if (matchingMessages.length > 0) {
      setCurrentMatchIndex(0);
    } else {
      setCurrentMatchIndex(-1);
    }
  }, [searchQuery, matchingMessages.length]);

  const hasMatches = matchingMessages.length > 0;
  const matchText =
    matchingMessages.length > 0 && currentMatchIndex >= 0
      ? `${currentMatchIndex + 1} of ${matchingMessages.length}`
      : "";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search messages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSearchQuery("");
              setCurrentMatchIndex(-1);
            }}
            className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {hasMatches && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{matchText}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateToMatch("prev")}
            className="h-8 w-8"
            aria-label="Previous match"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateToMatch("next")}
            className="h-8 w-8"
            aria-label="Next match"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to get highlighted message content
 */
export function useMessageHighlight(
  message: Message,
  searchQuery: string
): React.ReactNode {
  return useMemo(() => {
    if (!searchQuery.trim()) {
      return extractStringFromMessageContent(message);
    }
    const content = extractStringFromMessageContent(message);
    return highlightText(content, searchQuery);
  }, [message, searchQuery]);
}

