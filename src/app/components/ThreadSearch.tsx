"use client";

import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchMultipleFields } from "@/app/utils/searchUtils";
import type { ThreadItem } from "@/app/hooks/useThreads";

interface ThreadSearchProps {
  threads: ThreadItem[];
  onSearchChange?: (query: string) => void;
  className?: string;
}

export function ThreadSearch({
  threads,
  onSearchChange,
  className,
}: ThreadSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) {
      return threads;
    }

    return threads.filter((thread) =>
      searchMultipleFields(thread, searchQuery, [
        "title",
        "description",
        "status",
        (t) => t.updatedAt.toISOString(),
      ])
    );
  }, [threads, searchQuery]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onSearchChange?.(value);
  };

  const clearSearch = () => {
    setSearchQuery("");
    onSearchChange?.("");
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search threads..."
        value={searchQuery}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="pl-9 pr-9"
      />
      {searchQuery && (
        <Button
          variant="ghost"
          size="icon"
          onClick={clearSearch}
          className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export { ThreadSearch as default };

