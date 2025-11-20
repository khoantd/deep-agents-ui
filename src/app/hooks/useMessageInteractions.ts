import { useCallback, useEffect, useMemo, useState } from "react";

type ReactionMap = Record<string, Record<string, number>>;
type BookmarkMap = Record<string, boolean>;
type ThreadMap = {
  replies: Record<string, string[]>;
  parents: Record<string, string>;
};

interface MessageMetaState {
  reactions: ReactionMap;
  bookmarks: BookmarkMap;
  threads: ThreadMap;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
}

const STORAGE_PREFIX = "da-ui-message-meta";

const DEFAULT_STATE: MessageMetaState = {
  reactions: {},
  bookmarks: {},
  threads: {
    replies: {},
    parents: {},
  },
};

const DEFAULT_REACTIONS = ["👍", "🎯", "🔥", "💡", "✅", "❗️"] as const;

const isBrowser = typeof window !== "undefined";

export function useMessageInteractions(threadId?: string | null) {
  const [state, setState] = useState<MessageMetaState>(DEFAULT_STATE);

  useEffect(() => {
    if (!threadId || !isBrowser) {
      setState(DEFAULT_STATE);
      return;
    }
    try {
      const raw = window.localStorage.getItem(
        `${STORAGE_PREFIX}:${threadId}`
      );
      if (!raw) {
        setState(DEFAULT_STATE);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Partial<MessageMetaState>;
        setState({
          reactions: parsed.reactions ?? {},
          bookmarks: parsed.bookmarks ?? {},
          threads: {
            replies: parsed.threads?.replies ?? {},
            parents: parsed.threads?.parents ?? {},
          },
        });
      } catch (parseError) {
        // Log the error for debugging but don't crash the UI
        if (parseError instanceof SyntaxError) {
          console.warn(
            `Failed to parse message metadata for thread ${threadId}:`,
            parseError.message
          );
          // Clear corrupted data
          window.localStorage.removeItem(`${STORAGE_PREFIX}:${threadId}`);
        }
        setState(DEFAULT_STATE);
      }
    } catch (error) {
      // Fallback for any other errors
      console.warn("Error loading message metadata:", error);
      setState(DEFAULT_STATE);
    }
  }, [threadId]);

  const persist = useCallback(
    (updater: (prev: MessageMetaState) => MessageMetaState) => {
      setState((prev) => {
        const next = updater(prev);
        if (threadId && isBrowser) {
          window.localStorage.setItem(
            `${STORAGE_PREFIX}:${threadId}`,
            JSON.stringify(next)
          );
        }
        return next;
      });
    },
    [threadId]
  );

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      persist((prev) => {
        const messageReactions = prev.reactions[messageId] ?? {};
        const currentCount = messageReactions[emoji] ?? 0;
        const nextCount = currentCount === 0 ? 1 : 0;
        const updatedReactions = {
          ...prev.reactions,
          [messageId]: {
            ...messageReactions,
            [emoji]: nextCount,
          },
        };
        if (nextCount === 0) {
          delete updatedReactions[messageId][emoji];
          if (Object.keys(updatedReactions[messageId]).length === 0) {
            delete updatedReactions[messageId];
          }
        }
        return {
          ...prev,
          reactions: updatedReactions,
        };
      });
    },
    [persist]
  );

  const getReactions = useCallback(
    (messageId: string): ReactionSummary[] => {
      const reactions = state.reactions[messageId] ?? {};
      const allEmojis = new Set([
        ...DEFAULT_REACTIONS,
        ...Object.keys(reactions),
      ]);
      return Array.from(allEmojis).map((emoji) => ({
        emoji,
        count: reactions[emoji] ?? 0,
        reacted: Boolean(reactions[emoji]),
      }));
    },
    [state.reactions]
  );

  const toggleBookmark = useCallback(
    (messageId: string) => {
      persist((prev) => {
        const isBookmarked = prev.bookmarks[messageId];
        const nextBookmarks = {
          ...prev.bookmarks,
          [messageId]: !isBookmarked,
        };
        if (isBookmarked) {
          delete nextBookmarks[messageId];
        }
        return {
          ...prev,
          bookmarks: nextBookmarks,
        };
      });
    },
    [persist]
  );

  const isBookmarked = useCallback(
    (messageId: string) => Boolean(state.bookmarks[messageId]),
    [state.bookmarks]
  );

  const bookmarkedMessageIds = useMemo(
    () => Object.keys(state.bookmarks),
    [state.bookmarks]
  );

  const recordReply = useCallback(
    (parentId: string, replyId: string) => {
      if (!parentId || !replyId) return;
      persist((prev) => {
        const replies = prev.threads.replies[parentId] ?? [];
        if (replies.includes(replyId)) {
          return prev;
        }
        return {
          ...prev,
          threads: {
            replies: {
              ...prev.threads.replies,
              [parentId]: [...replies, replyId],
            },
            parents: {
              ...prev.threads.parents,
              [replyId]: parentId,
            },
          },
        };
      });
    },
    [persist]
  );

  const getReplyIds = useCallback(
    (messageId: string) => state.threads.replies[messageId] ?? [],
    [state.threads.replies]
  );

  const getReplyCount = useCallback(
    (messageId: string) => getReplyIds(messageId).length,
    [getReplyIds]
  );

  const getParentId = useCallback(
    (messageId: string) => state.threads.parents[messageId],
    [state.threads.parents]
  );

  return {
    getReactions,
    toggleReaction,
    isBookmarked,
    toggleBookmark,
    bookmarkedMessageIds,
    recordReply,
    getReplyIds,
    getReplyCount,
    getParentId,
  };
}

export const DEFAULT_REACTION_SET = DEFAULT_REACTIONS;

