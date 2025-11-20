/**
 * Thread metadata management utilities.
 * Handles pinned, archived, tags, and folder assignments for threads.
 */

export interface ThreadMetadata {
  pinned: boolean;
  archived: boolean;
  tags: string[];
  folder: string | null;
  pinnedAt?: number;
  archivedAt?: number;
}

const METADATA_KEY = "deep-agent-thread-metadata";

/**
 * Get all thread metadata from localStorage.
 */
export function getAllThreadMetadata(): Record<string, ThreadMetadata> {
  if (typeof window === "undefined") return {};

  const stored = localStorage.getItem(METADATA_KEY);
  if (!stored) return {};

  try {
    return JSON.parse(stored);
  } catch (parseError) {
    if (parseError instanceof SyntaxError) {
      console.warn(
        `Failed to parse thread metadata: ${parseError.message}. Clearing corrupted data.`
      );
      localStorage.removeItem(METADATA_KEY);
    }
    return {};
  }
}

/**
 * Get metadata for a specific thread.
 */
export function getThreadMetadata(threadId: string): ThreadMetadata {
  const allMetadata = getAllThreadMetadata();
  return (
    allMetadata[threadId] || {
      pinned: false,
      archived: false,
      tags: [],
      folder: null,
    }
  );
}

/**
 * Save metadata for a specific thread.
 */
export function saveThreadMetadata(
  threadId: string,
  metadata: Partial<ThreadMetadata>
): void {
  if (typeof window === "undefined") return;

  const allMetadata = getAllThreadMetadata();
  const existing = allMetadata[threadId] || {
    pinned: false,
    archived: false,
    tags: [],
    folder: null,
  };

  allMetadata[threadId] = {
    ...existing,
    ...metadata,
    // Update timestamps
    pinnedAt:
      metadata.pinned !== undefined
        ? metadata.pinned
          ? Date.now()
          : undefined
        : existing.pinnedAt,
    archivedAt:
      metadata.archived !== undefined
        ? metadata.archived
          ? Date.now()
          : undefined
        : existing.archivedAt,
  };

  localStorage.setItem(METADATA_KEY, JSON.stringify(allMetadata));
}

/**
 * Toggle pinned status for a thread.
 */
export function toggleThreadPin(threadId: string): void {
  const metadata = getThreadMetadata(threadId);
  saveThreadMetadata(threadId, { pinned: !metadata.pinned });
}

/**
 * Toggle archived status for a thread.
 */
export function toggleThreadArchive(threadId: string): void {
  const metadata = getThreadMetadata(threadId);
  saveThreadMetadata(threadId, { archived: !metadata.archived });
}

/**
 * Add a tag to a thread.
 */
export function addThreadTag(threadId: string, tag: string): void {
  const metadata = getThreadMetadata(threadId);
  if (!metadata.tags.includes(tag)) {
    saveThreadMetadata(threadId, {
      tags: [...metadata.tags, tag],
    });
  }
}

/**
 * Remove a tag from a thread.
 */
export function removeThreadTag(threadId: string, tag: string): void {
  const metadata = getThreadMetadata(threadId);
  saveThreadMetadata(threadId, {
    tags: metadata.tags.filter((t) => t !== tag),
  });
}

/**
 * Set folder for a thread.
 */
export function setThreadFolder(threadId: string, folder: string | null): void {
  saveThreadMetadata(threadId, { folder });
}

/**
 * Get all unique tags across all threads.
 */
export function getAllTags(): string[] {
  const allMetadata = getAllThreadMetadata();
  const tagSet = new Set<string>();
  Object.values(allMetadata).forEach((metadata) => {
    metadata.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

/**
 * Get all unique folders across all threads.
 */
export function getAllFolders(): string[] {
  const allMetadata = getAllThreadMetadata();
  const folderSet = new Set<string>();
  Object.values(allMetadata).forEach((metadata) => {
    if (metadata.folder) {
      folderSet.add(metadata.folder);
    }
  });
  return Array.from(folderSet).sort();
}

/**
 * Delete metadata for a thread (cleanup).
 */
export function deleteThreadMetadata(threadId: string): void {
  if (typeof window === "undefined") return;

  const allMetadata = getAllThreadMetadata();
  delete allMetadata[threadId];
  localStorage.setItem(METADATA_KEY, JSON.stringify(allMetadata));
}

