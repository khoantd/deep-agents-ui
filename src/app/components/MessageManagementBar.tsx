"use client";

import React, { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Copy,
  FileDown,
  MessageCircle,
  Reply,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ExportFormat } from "@/app/utils/messageActions";
import type { ReactionSummary } from "@/app/hooks/useMessageInteractions";

interface MessageManagementBarProps {
  reactions: ReactionSummary[];
  onReactionToggle: (emoji: string) => void;
  onReply: () => void;
  replyCount: number;
  onOpenThread: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onCopy: () => Promise<void> | void;
  onExport: (format: ExportFormat) => void;
}

export function MessageManagementBar({
  reactions,
  onReactionToggle,
  onReply,
  replyCount,
  onOpenThread,
  isBookmarked,
  onToggleBookmark,
  onCopy,
  onExport,
}: MessageManagementBarProps) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-1">
        {reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => onReactionToggle(reaction.emoji)}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 transition-colors duration-150 hover:border-primary/60 hover:text-primary"
            aria-pressed={reaction.reacted}
          >
            <span>{reaction.emoji}</span>
            {reaction.count > 0 && <span>{reaction.count}</span>}
          </button>
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1"
          onClick={onReply}
        >
          <Reply className="h-3.5 w-3.5" />
          Reply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1"
          onClick={onOpenThread}
          disabled={replyCount === 0}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {replyCount > 0 ? `Thread (${replyCount})` : "Thread"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1"
          onClick={onToggleBookmark}
        >
          {isBookmarked ? (
            <BookmarkCheck className="h-3.5 w-3.5" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
          Bookmark
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1"
          onClick={() => void onCopy()}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
        <Dialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Export message</DialogTitle>
              <DialogDescription>
                Choose a format to export this message with context.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {["markdown", "json", "pdf"].map((format) => (
                <Button
                  key={format}
                  variant="outline"
                  onClick={() => {
                    onExport(format as ExportFormat);
                    setExportDialogOpen(false);
                  }}
                >
                  Export as {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

