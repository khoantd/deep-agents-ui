"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useQueryState } from "nuqs";
import { getConfig, saveConfig, StandaloneConfig } from "@/lib/config";
import { ConfigDialog } from "@/app/components/ConfigDialog";
import { Button } from "@/components/ui/button";
import { Assistant } from "@langchain/langgraph-sdk";
import { ClientProvider } from "@/providers/ClientProvider";
import { Settings, MessagesSquare, SquarePen } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ThreadList } from "@/app/components/ThreadList";
import { ChatProvider } from "@/providers/ChatProvider";
import { ChatInterface } from "@/app/components/ChatInterface";
import { CommandPalette } from "@/app/components/CommandPalette";
import { Breadcrumb } from "@/app/components/Breadcrumb";
import { useThreads } from "@/app/hooks/useThreads";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ProtectedRoute } from "@/app/components/ProtectedRoute";
import { useAuth } from "@/providers/AuthProvider";
import { UserProfile } from "@/app/components/UserProfile";

function HomePageContent() {
  const { user } = useAuth();
  const [config, setConfig] = useState<StandaloneConfig | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [userProfileOpen, setUserProfileOpen] = useState(false);
  const [debugMode, _] = useState(false);
  const [assistantId, setAssistantId] = useQueryState("assistantId");
  const [_threadId, setThreadId] = useQueryState("threadId");
  const [sidebar, setSidebar] = useQueryState("sidebar");

  const [mutateThreads, setMutateThreads] = useState<(() => void) | null>(null);
  const mutateThreadsRef = useRef<(() => void) | null>(null);
  const [interruptCount, setInterruptCount] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [threadId] = useQueryState("threadId");

  // Update ref when mutateThreads changes
  useEffect(() => {
    mutateThreadsRef.current = mutateThreads;
  }, [mutateThreads]);

  // Get current thread for breadcrumb (memoized to prevent unnecessary re-renders)
  const threads = useThreads({ limit: 100 });
  const currentThread = useMemo(() => {
    return threads.data?.flat().find((t) => t.id === threadId);
  }, [threads.data, threadId]);

  // On mount, check for saved config, otherwise show config dialog
  useEffect(() => {
    const savedConfig = getConfig();
    if (savedConfig) {
      setConfig(savedConfig);
      if (!assistantId) {
        setAssistantId(savedConfig.assistantId);
      }
    } else {
      setConfigDialogOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If config changes, update the assistantId
  useEffect(() => {
    if (config && !assistantId) {
      setAssistantId(config.assistantId);
    }
  }, [config, assistantId, setAssistantId]);

  const handleSaveConfig = (newConfig: StandaloneConfig) => {
    saveConfig(newConfig);
    setConfig(newConfig);
  };

  // Memoize callbacks to prevent infinite loops
  const handleMutateReady = useCallback((fn: () => void) => {
    mutateThreadsRef.current = fn;
    setMutateThreads(() => fn);
  }, []);

  // Use ref to avoid dependency on mutateThreads, preventing infinite loops
  // Add debounce guard to prevent rapid successive calls
  const lastRevalidateTime = useRef<number>(0);
  const handleHistoryRevalidate = useCallback(() => {
    const now = Date.now();
    // Debounce: only allow revalidation once per 100ms
    if (now - lastRevalidateTime.current < 100) {
      return;
    }
    lastRevalidateTime.current = now;
    mutateThreadsRef.current?.();
  }, []); // Empty deps - stable callback that always uses latest mutateThreads

  const handleThreadSelect = useCallback(async (id: string) => {
    await setThreadId(id);
  }, [setThreadId]);

  const handleCloseSidebar = useCallback(() => {
    setSidebar(null);
  }, [setSidebar]);

  const langsmithApiKey =
    config?.langsmithApiKey || process.env.NEXT_PUBLIC_LANGSMITH_API_KEY || "";

  // Memoize assistant object to prevent unnecessary re-renders
  // MUST be called before any early returns to follow Rules of Hooks
  // Use stable values to prevent object reference changes on every render
  const assistantTimestamp = useMemo(() => new Date().toISOString(), []);
  const stableEmptyObject = useMemo(() => ({}), []);
  const assistant: Assistant = useMemo(
    () => ({
      assistant_id: config?.assistantId || "",
      graph_id: config?.assistantId || "",
      created_at: assistantTimestamp,
      updated_at: assistantTimestamp,
      config: stableEmptyObject,
      metadata: stableEmptyObject,
      version: 1,
      name: "Default Assistant",
      context: stableEmptyObject,
    }),
    [config?.assistantId, assistantTimestamp, stableEmptyObject]
  );

  if (!config) {
    return (
      <>
        <ConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={handleSaveConfig}
        />
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Welcome to Standalone Chat</h1>
            <p className="mt-2 text-muted-foreground">
              Configure your deployment to get started
            </p>
            <Button
              onClick={() => setConfigDialogOpen(true)}
              className="mt-4"
            >
              Open Configuration
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSave={handleSaveConfig}
        initialConfig={config}
      />
      <UserProfile
        open={userProfileOpen}
        onOpenChange={setUserProfileOpen}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onThreadSelect={handleThreadSelect}
      />
      <ClientProvider
        deploymentUrl={config.deploymentUrl}
        apiKey={langsmithApiKey}
      >
        <div className="flex h-screen flex-col">
          <header className="flex h-16 items-center justify-between border-b border-border px-6">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <h1 className="text-xl font-semibold flex-shrink-0">Agents UI</h1>
              {threadId && currentThread && (
                <Breadcrumb thread={currentThread} className="flex-shrink-0" />
              )}
              {!sidebar && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebar("1")}
                  className="rounded-md border border-border bg-card p-3 text-foreground hover:bg-accent flex-shrink-0"
                >
                  <MessagesSquare className="mr-2 h-4 w-4" />
                  Threads
                  {interruptCount > 0 && (
                    <span className="ml-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                      {interruptCount}
                    </span>
                  )}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Assistant:</span>{" "}
                {config.assistantId}
              </div>
              <ThemeToggle />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUserProfileOpen(true)}
                className="flex items-center gap-2"
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name || "User"}
                    className="h-4 w-4 rounded-full"
                  />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-primary"></span>
                )}
                {user?.name || "Profile"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfigDialogOpen(true)}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setThreadId(null)}
                disabled={!_threadId}
                // Make this button the same teal as used elsewhere
                className="border-[#2F6868] bg-[#2F6868] text-white hover:bg-[#2F6868]/80"
              >
                <SquarePen className="mr-2 h-4 w-4" />
                New Thread
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="standalone-chat"
            >
              {sidebar && (
                <>
                  <ResizablePanel
                    id="thread-history"
                    order={1}
                    defaultSize={25}
                    minSize={20}
                    className="relative min-w-[380px]"
                  >
                    <ThreadList
                      onThreadSelect={handleThreadSelect}
                      onMutateReady={handleMutateReady}
                      onClose={handleCloseSidebar}
                      onInterruptCountChange={setInterruptCount}
                    />
                  </ResizablePanel>
                  <ResizableHandle />
                </>
              )}

              <ResizablePanel
                id="chat"
                className="relative flex flex-col"
                order={2}
              >
                <ChatProvider
                  activeAssistant={assistant}
                  onHistoryRevalidate={handleHistoryRevalidate}
                >
                  <ChatInterface
                    assistant={assistant}
                    debugMode={debugMode}
                    controls={<></>}
                    skeleton={
                      <div className="flex items-center justify-center p-8">
                        <p className="text-muted-foreground">Loading...</p>
                      </div>
                    }
                  />
                </ChatProvider>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </ClientProvider>
    </>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        }
      >
        <HomePageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
