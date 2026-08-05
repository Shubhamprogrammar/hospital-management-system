"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  BotIcon,
  MessageSquareTextIcon,
  PlusIcon,
  SendIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import {
  getChatbotHistory,
  sendChatbotFeedback,
  sendChatbotMessage,
  startChatbotSession,
} from "@/shared/services/chat.service";

/** Messages are Mongo docs (ChatbotMessage) — shape differs from the REST ChatMessage. */
interface ChatbotMessageView {
  _id: string;
  sessionId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface ReplyResult {
  reply: string;
  guardrailTriggered: boolean;
  messageIds: { user: string; assistant: string };
}

export default function ChatbotPage() {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatbotMessageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<Record<string, "UP" | "DOWN">>({});
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const start = useMutation({
    mutationFn: () => startChatbotSession(),
    onSuccess: async (session) => {
      setSessionId(session.id);
      setMessages([]);
      setFeedback({});
      try {
        const history = await getChatbotHistory(session.id);
        setMessages((history.messages ?? []).map((m) => ({ ...m } as ChatbotMessageView)));
      } catch {
        // History fetch is best-effort — a fresh session has none anyway.
      }
      toast.success("Chat started — ask me anything about the hospital");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (message: string) => sendChatbotMessage(sessionId!, { content: message }),
    onSuccess: (result: ReplyResult) => {
      setMessages((prev) => [
        ...prev,
        {
          _id: result.messageIds.user,
          sessionId: sessionId!,
          role: "USER",
          content: draft,
          createdAt: new Date().toISOString(),
        },
        {
          _id: result.messageIds.assistant,
          sessionId: sessionId!,
          role: "ASSISTANT",
          content: result.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitFeedback = useMutation({
    mutationFn: (input: { messageId: string; rating: "UP" | "DOWN" }) =>
      sendChatbotFeedback(sessionId!, { rating: input.rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      toast.success("Thanks for the feedback");
      setFeedbackOpen(null);
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["chatbot"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSend = () => {
    if (!draft.trim() || send.isPending) return;
    setLoading(true);
    send.mutate(draft.trim(), {
      onSettled: () => setLoading(false),
    });
  };

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      <PageHeader
        title="Hospital Assistant"
        description="AI chatbot for appointment guidance, FAQs, and hospital info. Not a substitute for medical advice."
        actions={
          sessionId ? (
            <Button variant="outline" onClick={() => start.mutate()} disabled={start.isPending}>
              <PlusIcon /> New chat
            </Button>
          ) : undefined
        }
      />

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card">
        {!sessionId ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={BotIcon}
              title="Need help?"
              description="Start a chat for appointment guidance, lab report FAQs, and hospital information."
              action={
                <Button onClick={() => start.mutate()} disabled={start.isPending}>
                  {start.isPending ? "Starting…" : "Start chat"}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {messages.length === 0 && !send.isPending ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  icon={MessageSquareTextIcon}
                  title="Ask me anything"
                  description="Try 'How do I book an appointment?' or 'When will my lab report be ready?'"
                />
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-3 p-4">
                  {messages.map((m) => {
                  const mine = m.role === "USER";
                  const isAssistant = m.role === "ASSISTANT";
                  return (
                    <div key={m._id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
                        }`}
                      >
                        {!mine && (
                          <p className="mb-0.5 flex items-center gap-1 text-xs font-medium opacity-80">
                            <BotIcon className="size-3" /> Assistant
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {isAssistant && (
                        <div className="mt-1 flex items-center gap-1">
                          {feedback[m._id] ? (
                            <span className="text-xs text-muted-foreground">
                              {feedback[m._id] === "UP" ? "Helpful" : "Not helpful"}
                            </span>
                          ) : (
                            <>
                              <button
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                onClick={() => {
                                  setFeedback((prev) => ({ ...prev, [m._id]: "UP" }));
                                  submitFeedback.mutate({ messageId: m._id, rating: "UP" });
                                }}
                                aria-label="Helpful"
                              >
                                <ThumbsUpIcon className="size-3.5" />
                              </button>
                              <button
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                onClick={() => setFeedbackOpen(m._id)}
                                aria-label="Not helpful"
                              >
                                <ThumbsDownIcon className="size-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {send.isPending && (
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-2 text-sm text-muted-foreground">
                    <Skeleton className="size-4 rounded-full" />
                    Typing…
                  </div>
                )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                className="flex-1"
                maxLength={2000}
              />
              <Button type="submit" size="icon" disabled={!draft.trim() || send.isPending}>
                <SendIcon />
              </Button>
            </form>
          </>
        )}
      </div>

      {/* Feedback comment dialog */}
      {feedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={() => setFeedbackOpen(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <ThumbsDownIcon className="size-4" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold">Was this answer unhelpful?</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Tell us what went wrong (optional).</p>
              </div>
            </div>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. The answer didn't address my question…"
              className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFeedbackOpen(null)}>Cancel</Button>
              <Button
                disabled={submitFeedback.isPending}
                onClick={() => {
                  setFeedback((prev) => ({ ...prev, [feedbackOpen]: "DOWN" }));
                  submitFeedback.mutate({ messageId: feedbackOpen, rating: "DOWN" });
                }}
              >
                {submitFeedback.isPending ? "Submitting…" : "Submit feedback"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
