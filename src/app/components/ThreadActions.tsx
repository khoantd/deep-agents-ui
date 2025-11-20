"use client";

import React, { useState, useCallback } from "react";
import {
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Tag,
  Folder,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  toggleThreadPin,
  toggleThreadArchive,
  addThreadTag,
  removeThreadTag,
  setThreadFolder,
  getThreadMetadata,
  getAllTags,
  getAllFolders,
} from "@/lib/threadMetadata";
import { cn } from "@/lib/utils";

interface ThreadActionsProps {
  threadId: string;
  onMetadataChange?: () => void;
  className?: string;
}

export function ThreadActions({
  threadId,
  onMetadataChange,
  className,
}: ThreadActionsProps) {
  const [metadata, setMetadata] = useState(() =>
    getThreadMetadata(threadId)
  );
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const allTags = getAllTags();
  const allFolders = getAllFolders();

  const handlePin = useCallback(() => {
    toggleThreadPin(threadId);
    setMetadata(getThreadMetadata(threadId));
    onMetadataChange?.();
  }, [threadId, onMetadataChange]);

  const handleArchive = useCallback(() => {
    toggleThreadArchive(threadId);
    setMetadata(getThreadMetadata(threadId));
    onMetadataChange?.();
  }, [threadId, onMetadataChange]);

  const handleAddTag = useCallback(() => {
    if (newTag.trim()) {
      addThreadTag(threadId, newTag.trim());
      setMetadata(getThreadMetadata(threadId));
      setNewTag("");
      onMetadataChange?.();
    }
  }, [threadId, newTag, onMetadataChange]);

  const handleRemoveTag = useCallback(
    (tag: string) => {
      removeThreadTag(threadId, tag);
      setMetadata(getThreadMetadata(threadId));
      onMetadataChange?.();
    },
    [threadId, onMetadataChange]
  );

  const handleSetFolder = useCallback(
    (folder: string | null) => {
      setThreadFolder(threadId, folder);
      setMetadata(getThreadMetadata(threadId));
      onMetadataChange?.();
    },
    [threadId, onMetadataChange]
  );

  return (
    <>
      <div className={cn("flex items-center gap-1", className)}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handlePin}
          title={metadata.pinned ? "Unpin thread" : "Pin thread"}
        >
          {metadata.pinned ? (
            <Pin className="h-3.5 w-3.5 fill-current" />
          ) : (
            <PinOff className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleArchive}
          title={metadata.archived ? "Unarchive thread" : "Archive thread"}
        >
          {metadata.archived ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setTagsDialogOpen(true)}
          title="Manage tags"
        >
          <Tag className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setFolderDialogOpen(true)}
          title="Set folder"
        >
          <Folder className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog
        open={tagsDialogOpen}
        onOpenChange={setTagsDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
            <DialogDescription>
              Add or remove tags for this thread
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter tag name"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button
                onClick={handleAddTag}
                disabled={!newTag.trim()}
              >
                Add
              </Button>
            </div>
            {metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {metadata.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 rounded-full hover:bg-secondary-foreground/20"
                      aria-label={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {allTags.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Existing tags:</p>
                <div className="flex flex-wrap gap-2">
                  {allTags
                    .filter((tag) => !metadata.tags.includes(tag))
                    .map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => {
                          addThreadTag(threadId, tag);
                          setMetadata(getThreadMetadata(threadId));
                          onMetadataChange?.();
                        }}
                      >
                        + {tag}
                      </Badge>
                    ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Folder</DialogTitle>
            <DialogDescription>
              Assign this thread to a folder
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select
              value={metadata.folder || "none"}
              onValueChange={(value) =>
                handleSetFolder(value === "none" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No folder</SelectItem>
                {allFolders.map((folder) => (
                  <SelectItem
                    key={folder}
                    value={folder}
                  >
                    {folder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                placeholder="Create new folder"
                id="new-folder"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const input = e.currentTarget;
                    if (input.value.trim()) {
                      handleSetFolder(input.value.trim());
                      input.value = "";
                    }
                  }
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

