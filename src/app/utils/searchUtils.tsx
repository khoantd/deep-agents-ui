"use client";

/**
 * Utility functions for search and highlighting
 */

import React from "react";

/**
 * Highlights search terms in text
 */
export function highlightText(
  text: string,
  searchTerm: string,
  className: string = "bg-yellow-200 dark:bg-yellow-900"
): React.ReactNode {
  if (!searchTerm.trim()) {
    return text;
  }

  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) => {
    // When using split with a capturing group, every other element is the match
    // Check if this part matches the search term (case-insensitive)
    const lowerPart = part.toLowerCase();
    const lowerSearchTerm = searchTerm.toLowerCase();
    if (lowerPart === lowerSearchTerm && part.length > 0) {
      return (
        <mark
          key={index}
          className={className}
        >
          {part}
        </mark>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Escapes special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Searches text with case-insensitive matching
 */
export function searchText(text: string, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  return text.toLowerCase().includes(searchTerm.toLowerCase());
}

/**
 * Searches multiple fields in an object
 */
export function searchMultipleFields<T>(
  item: T,
  searchTerm: string,
  fields: Array<keyof T | ((item: T) => string)>
): boolean {
  if (!searchTerm.trim()) return true;

  const lowerSearchTerm = searchTerm.toLowerCase();

  return fields.some((field) => {
    if (typeof field === "function") {
      const value = field(item);
      return value?.toLowerCase().includes(lowerSearchTerm) ?? false;
    }
    const value = item[field];
    if (typeof value === "string") {
      return value.toLowerCase().includes(lowerSearchTerm);
    }
    if (value instanceof Date) {
      return value.toISOString().toLowerCase().includes(lowerSearchTerm);
    }
    return false;
  });
}

