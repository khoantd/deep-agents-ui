"use client";

import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Thread } from "@langchain/langgraph-sdk";

export interface FilterState {
  status?: Thread["status"];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  assistantId?: string;
}

interface AdvancedFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableAssistantIds?: string[];
  className?: string;
}

export function AdvancedFilters({
  filters,
  onFiltersChange,
  availableAssistantIds = [],
  className,
}: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  const hasActiveFilters =
    localFilters.status ||
    localFilters.dateRange?.start ||
    localFilters.dateRange?.end ||
    localFilters.assistantId;

  const applyFilters = () => {
    onFiltersChange(localFilters);
    setOpen(false);
  };

  const clearFilters = () => {
    const cleared: FilterState = {};
    setLocalFilters(cleared);
    onFiltersChange(cleared);
  };

  const handleStatusChange = (value: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      // Map "completed" to "idle" since LangGraph uses "idle" for completed threads
      status: value === "all" 
        ? undefined 
        : value === "completed"
          ? ("idle" as Thread["status"])
          : (value as Thread["status"]),
    }));
  };

  const handleStartDateChange = (value: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        start: value ? new Date(value) : undefined,
      },
    }));
  };

  const handleEndDateChange = (value: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        end: value ? new Date(value) : undefined,
      },
    }));
  };

  const handleAssistantChange = (value: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      assistantId: value === "all" ? undefined : value,
    }));
  };

  // Sync local filters with external filters
  React.useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("relative", className)}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              !
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Advanced Filters</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={localFilters.status || "all"}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="idle">Idle (Completed)</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="interrupted">Interrupted</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-2">
            <Label>Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label
                  htmlFor="start-date"
                  className="text-xs text-muted-foreground"
                >
                  Start Date
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={
                    localFilters.dateRange?.start
                      ? localFilters.dateRange.start.toISOString().split("T")[0]
                      : ""
                  }
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="end-date"
                  className="text-xs text-muted-foreground"
                >
                  End Date
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={
                    localFilters.dateRange?.end
                      ? localFilters.dateRange.end.toISOString().split("T")[0]
                      : ""
                  }
                  onChange={(e) => handleEndDateChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Assistant Filter */}
          {availableAssistantIds.length > 0 && (
            <div className="space-y-2">
              <Label>Assistant</Label>
              <Select
                value={localFilters.assistantId || "all"}
                onValueChange={handleAssistantChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All assistants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assistants</SelectItem>
                  {availableAssistantIds.map((id) => (
                    <SelectItem
                      key={id}
                      value={id}
                    >
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="space-y-2">
              <Label>Active Filters</Label>
              <div className="flex flex-wrap gap-2">
                {localFilters.status && (
                  <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
                    <span>Status: {localFilters.status}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalFilters((prev) => ({ ...prev, status: undefined }))
                      }
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {localFilters.dateRange?.start && (
                  <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
                    <span>
                      From: {localFilters.dateRange.start.toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalFilters((prev) => ({
                          ...prev,
                          dateRange: { ...prev.dateRange, start: undefined },
                        }))
                      }
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {localFilters.dateRange?.end && (
                  <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
                    <span>
                      To: {localFilters.dateRange.end.toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalFilters((prev) => ({
                          ...prev,
                          dateRange: { ...prev.dateRange, end: undefined },
                        }))
                      }
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {localFilters.assistantId && (
                  <div className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
                    <span>Assistant: {localFilters.assistantId}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setLocalFilters((prev) => ({
                          ...prev,
                          assistantId: undefined,
                        }))
                      }
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
            >
              Clear All
            </Button>
            <Button onClick={applyFilters}>Apply Filters</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

