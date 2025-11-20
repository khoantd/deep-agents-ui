"use client";

import React from "react";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { getThreadMetadata, getAllFolders } from "@/lib/threadMetadata";
import type { ThreadItem } from "@/app/hooks/useThreads";

interface BreadcrumbProps {
  thread?: ThreadItem | null;
  className?: string;
}

export function Breadcrumb({ thread, className }: BreadcrumbProps) {
  if (!thread) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className
        )}
      >
        <Home className="h-4 w-4" />
        <span>All Threads</span>
      </div>
    );
  }

  const metadata = getThreadMetadata(thread.id);
  const folder = metadata.folder;

  return (
    <nav
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground",
        className
      )}
      aria-label="Breadcrumb"
    >
      <Home className="h-4 w-4" />
      <ChevronRight className="h-3 w-3" />
      {folder && (
        <>
          <span className="truncate">{folder}</span>
          <ChevronRight className="h-3 w-3" />
        </>
      )}
      <span className="truncate font-medium text-foreground">
        {thread.title}
      </span>
    </nav>
  );
}

