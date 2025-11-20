"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Zap,
  GitBranch,
  FileText,
  MessageSquare,
  Shield,
  ArrowRight,
  Sparkles,
  Code,
  Layers,
  Rocket,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export function LandingPage({ onSignIn, onSignUp }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold">Deep Agents UI</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Button variant="ghost" onClick={onSignIn} className="hidden sm:flex">
              Sign In
            </Button>
            <Button onClick={onSignUp} className="hidden sm:flex">
              Get Started
            </Button>
            <Button variant="ghost" size="sm" onClick={onSignIn} className="sm:hidden">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-20 sm:py-32 lg:py-40">
        <div className="container mx-auto">
          <div className="mx-auto max-w-4xl text-center">
            {/* Animated badge */}
            <div className="mb-8 flex justify-center">
              <div className="group relative inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/10">
                <Sparkles className="h-4 w-4 animate-pulse" />
                <span>Powered by LangGraph & Deep Agents</span>
              </div>
            </div>

            {/* Main headline */}
            <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                Build Intelligent
              </span>
              <br />
              <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                AI Agents That Think
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mb-10 text-lg text-muted-foreground sm:text-xl lg:text-2xl">
              Interact with powerful deep agents that plan, execute, and delegate tasks
              autonomously. Experience the future of AI-powered workflows.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={onSignUp}
                className="group h-12 px-8 text-base font-semibold shadow-lg transition-all hover:scale-105 hover:shadow-xl"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={onSignIn}
                className="h-12 px-8 text-base font-semibold"
              >
                Sign In
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>Secure & Private</span>
              </div>
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <span>Lightning Fast</span>
              </div>
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-primary" />
                <span>Open Source</span>
              </div>
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-border/40 bg-muted/30 px-4 py-20 sm:py-24">
        <div className="container mx-auto">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Powerful Features
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to build and interact with intelligent AI agents
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1 */}
            <div className="group relative rounded-2xl border border-border/50 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Intelligent Planning</h3>
              <p className="text-muted-foreground">
                Agents plan their tasks before execution, breaking down complex problems into
                manageable steps.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group relative rounded-2xl border border-border/50 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <GitBranch className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Sub-Agent Delegation</h3>
              <p className="text-muted-foreground">
                Delegate tasks to specialized sub-agents with isolated context for parallel
                execution.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group relative rounded-2xl border border-border/50 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">File System Access</h3>
              <p className="text-muted-foreground">
                Agents can read, write, and manage files directly, enabling powerful automation
                workflows.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group relative rounded-2xl border border-border/50 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Thread Persistence</h3>
              <p className="text-muted-foreground">
                All conversations are saved and can be resumed anytime. Never lose your work.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="group relative rounded-2xl border border-border/50 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Code Execution</h3>
              <p className="text-muted-foreground">
                Run shell commands and scripts safely, giving agents the power to interact with
                your system.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="group relative rounded-2xl border border-border/50 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-lg">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Modern UI</h3>
              <p className="text-muted-foreground">
                Beautiful, responsive interface with dark mode support and real-time updates.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-t border-border/40 px-4 py-20 sm:py-24">
        <div className="container mx-auto">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                How It Works
              </h2>
              <p className="mb-16 text-lg text-muted-foreground">
                Get started in minutes with our simple workflow
              </p>
            </div>

            <div className="space-y-12">
              {/* Step 1 */}
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-xl font-semibold">Deploy Your Agent</h3>
                  <p className="text-muted-foreground">
                    Use LangGraph to deploy your deep agent. The agent can be a research assistant,
                    code generator, or any custom workflow you build.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-xl font-semibold">Connect & Configure</h3>
                  <p className="text-muted-foreground">
                    Enter your deployment URL and assistant ID. Optionally add your LangSmith API
                    key for enhanced observability.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-xl font-semibold">Start Chatting</h3>
                  <p className="text-muted-foreground">
                    Begin interacting with your agent. Watch as it plans, delegates, and executes
                    complex tasks autonomously.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border/40 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 px-4 py-20 sm:py-24">
        <div className="container mx-auto">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to Get Started?
            </h2>
            <p className="mb-8 text-lg text-muted-foreground">
              Join the future of AI-powered automation. Start building intelligent agents today.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                onClick={onSignUp}
                className="group h-12 px-8 text-base font-semibold shadow-lg transition-all hover:scale-105 hover:shadow-xl"
              >
                Create Free Account
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={onSignIn}
                className="h-12 px-8 text-base font-semibold"
              >
                Sign In to Existing Account
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-4 py-12">
        <div className="container mx-auto">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Brain className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Deep Agents UI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built with{" "}
              <a
                href="https://github.com/langchain-ai/deepagents"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                Deep Agents
              </a>{" "}
              and{" "}
              <a
                href="https://github.com/langchain-ai/langgraph"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                LangGraph
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

