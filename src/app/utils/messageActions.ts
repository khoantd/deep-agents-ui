import { Message } from "@langchain/langgraph-sdk";
import { jsPDF } from "jspdf";
import { extractStringFromMessageContent } from "@/app/utils/utils";

type ExportFormat = "markdown" | "json" | "pdf";

interface ExportOptions {
  message: Message;
  threadId?: string | null;
  replies?: Message[];
  format: ExportFormat;
}

interface ThreadExportOptions {
  messages: Message[];
  threadId?: string | null;
  format: ExportFormat;
  title?: string;
}

const sanitizeFilename = (value: string) =>
  value.replace(/[^a-z0-9-_]/gi, "_").slice(0, 64) || "message";

const getAuthorLabel = (message: Message) => {
  switch (message.type) {
    case "human":
      return "User";
    case "ai":
      return "Assistant";
    case "tool":
      return "Tool";
    default:
      return "System";
  }
};

export const getMessageSnippet = (message: Message, length = 140) => {
  const content = extractStringFromMessageContent(message) ?? "";
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= length) return cleaned;
  return `${cleaned.slice(0, length - 1)}…`;
};

export async function copyMessageWithContext(
  message: Message,
  threadId?: string | null,
  parentSnippet?: string
) {
  const content = extractStringFromMessageContent(message) ?? "";
  const context = [
    `Thread: ${threadId ?? "unknown"}`,
    `Author: ${getAuthorLabel(message)}`,
    `Message ID: ${message.id ?? "untracked"}`,
  ];
  if (parentSnippet) {
    context.push(`Replying to: ${parentSnippet}`);
  }
  const payload = `${context.join("\n")}\n${"-".repeat(40)}\n${content}`;
  await navigator.clipboard.writeText(payload);
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const exportAsMarkdown = ({
  message,
  threadId,
  replies = [],
}: Omit<ExportOptions, "format">) => {
  const body = extractStringFromMessageContent(message) ?? "";
  const replySection =
    replies.length > 0
      ? [
          "",
          "## Thread Replies",
          ...replies.map(
            (reply, index) =>
              `### Reply ${index + 1} (${getAuthorLabel(reply)})\n${extractStringFromMessageContent(
                reply
              )}`
          ),
        ].join("\n")
      : "";
  const markdown = [
    `# Message Export`,
    `- Thread: ${threadId ?? "unknown"}`,
    `- Author: ${getAuthorLabel(message)}`,
    `- Message ID: ${message.id ?? "untracked"}`,
    "",
    "## Content",
    body,
    replySection,
  ]
    .filter(Boolean)
    .join("\n");
  downloadBlob(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    `${sanitizeFilename(threadId ?? "thread")}-${message.id ?? "message"}.md`
  );
};

const exportAsJson = ({
  message,
  threadId,
  replies = [],
}: Omit<ExportOptions, "format">) => {
  const payload = {
    threadId,
    message: {
      id: message.id,
      author: getAuthorLabel(message),
      content: extractStringFromMessageContent(message),
    },
    replies: replies.map((reply) => ({
      id: reply.id,
      author: getAuthorLabel(reply),
      content: extractStringFromMessageContent(reply),
    })),
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }),
    `${sanitizeFilename(threadId ?? "thread")}-${message.id ?? "message"}.json`
  );
};

const exportAsPdf = ({
  message,
  threadId,
  replies = [],
}: Omit<ExportOptions, "format">) => {
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
  });
  const margin = 48;
  let cursor = margin;

  const writeLine = (text: string, options?: { bold?: boolean }) => {
    if (options?.bold) {
      doc.setFont(undefined, "bold");
    } else {
      doc.setFont(undefined, "normal");
    }
    const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - margin * 2);
    doc.text(lines, margin, cursor);
    cursor += lines.length * 16;
  };

  const ensureSpace = (height = 24) => {
    if (cursor + height > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      cursor = margin;
    }
  };

  writeLine("Message Export", { bold: true });
  ensureSpace();
  [
    `Thread: ${threadId ?? "unknown"}`,
    `Author: ${getAuthorLabel(message)}`,
    `Message ID: ${message.id ?? "untracked"}`,
  ].forEach((line) => {
    writeLine(line);
    ensureSpace(16);
  });

  ensureSpace(24);
  writeLine("Content", { bold: true });
  ensureSpace(16);
  writeLine(extractStringFromMessageContent(message) ?? "");

  if (replies.length > 0) {
    ensureSpace(24);
    writeLine("Thread Replies", { bold: true });
    replies.forEach((reply, index) => {
      ensureSpace(24);
      writeLine(`Reply ${index + 1} (${getAuthorLabel(reply)})`, {
        bold: true,
      });
      ensureSpace(16);
      writeLine(extractStringFromMessageContent(reply) ?? "");
    });
  }

  doc.save(
    `${sanitizeFilename(threadId ?? "thread")}-${message.id ?? "message"}.pdf`
  );
};

export const exportMessage = (options: ExportOptions) => {
  switch (options.format) {
    case "markdown":
      return exportAsMarkdown(options);
    case "json":
      return exportAsJson(options);
    case "pdf":
      return exportAsPdf(options);
    default:
      return;
  }
};

export const exportThread = ({
  messages,
  threadId,
  format,
  title,
}: ThreadExportOptions) => {
  const header = title ?? "Thread Export";
  const filename = sanitizeFilename(threadId ?? "thread");
  if (format === "json") {
    const payload = messages.map((message) => ({
      id: message.id,
      author: getAuthorLabel(message),
      type: message.type,
      content: extractStringFromMessageContent(message),
    }));
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      `${filename}.json`
    );
    return;
  }

  if (format === "markdown") {
    const markdown = [
      `# ${header}`,
      `Thread: ${threadId ?? "unknown"}`,
      "",
      ...messages.map(
        (message, index) =>
          `## Message ${index + 1} (${getAuthorLabel(message)})\n${extractStringFromMessageContent(
            message
          )}`
      ),
    ].join("\n\n");
    downloadBlob(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      `${filename}.md`
    );
    return;
  }

  if (format === "pdf") {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    let cursor = margin;
    const pageWidth = doc.internal.pageSize.getWidth();
    const writeText = (text: string, options?: { bold?: boolean }) => {
      doc.setFont(undefined, options?.bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
      doc.text(lines, margin, cursor);
      cursor += lines.length * 16;
    };
    const ensureSpace = (height = 24) => {
      if (cursor + height > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        cursor = margin;
      }
    };
    writeText(header, { bold: true });
    ensureSpace(16);
    writeText(`Thread: ${threadId ?? "unknown"}`);
    ensureSpace(24);
    messages.forEach((message, index) => {
      ensureSpace(32);
      writeText(`Message ${index + 1} (${getAuthorLabel(message)})`, {
        bold: true,
      });
      ensureSpace(12);
      writeText(extractStringFromMessageContent(message) ?? "");
    });
    doc.save(`${filename}.pdf`);
  }
};

export type { ExportFormat };

