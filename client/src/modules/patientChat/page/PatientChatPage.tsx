"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { MessageSquareHeartIcon, SendIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import {
  closePatientConversation, escalatePatientConversation, getPatientChatMessages,
  listPatientConversations, sendPatientChatMessage, startPatientConversation,
} from "@/shared/services/chat.service";
import { listDepartments } from "@/shared/services/org.service";
import { useSession } from "@/shared/lib/auth-client";
import { useSocketEvent } from "@/shared/lib/hooks/useSocket";
import { ROLES } from "@/shared/types";

/** Messages are stored in Mongo (PatientChatMessage) — shape differs from ChatMessage. */
interface PatientChatMessageView {
  _id: string;
  conversationId: string;
  senderType: "PATIENT" | "STAFF";
  senderId: string;
  body: string;
  createdAt: string;
}

export default function PatientChatPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [escalateFor, setEscalateFor] = useState<string | null>(null);
  const [escalateReason, setEscalateReason] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const role = session?.user?.role as string | undefined;
  const isPatient = role === ROLES.PATIENT;
  const myId = session?.user?.id;

  const conversations = useQuery({
    queryKey: ["patient-chat", "conversations"],
    queryFn: () => listPatientConversations({ limit: 50 }),
  });

  const departments = useQuery({
    queryKey: ["departments", "patient-chat-options"],
    queryFn: () => listDepartments({ limit: 100, isActive: true }),
    enabled: startOpen,
  });

  const messages = useQuery({
    queryKey: ["patient-chat", "messages", activeId],
    queryFn: () => getPatientChatMessages(activeId!, { limit: 100 }),
    enabled: !!activeId,
  });

  useSocketEvent<{ conversationId: string }>("patient-chat:message-new", (payload) => {
    if (payload.conversationId === activeId) {
      queryClient.invalidateQueries({ queryKey: ["patient-chat", "messages", activeId] });
    }
    queryClient.invalidateQueries({ queryKey: ["patient-chat", "conversations"] });
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["patient-chat"] });
  };

  const start = useMutation({
    mutationFn: (dept?: string) => startPatientConversation({ departmentId: dept || undefined }),
    onSuccess: (conv) => {
      setActiveId(conv.id);
      setStartOpen(false);
      setDepartmentId("");
      toast.success("Conversation started");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (body: string) => sendPatientChatMessage(activeId!, { body }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["patient-chat", "messages", activeId] });
      queryClient.invalidateQueries({ queryKey: ["patient-chat", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const escalate = useMutation({
    mutationFn: (id: string) =>
      escalatePatientConversation(id, { escalateTo: "APPOINTMENT", details: escalateReason.trim() ? { reason: escalateReason.trim() } : undefined }),
    onSuccess: () => {
      toast.success("Conversation escalated");
      setEscalateFor(null);
      setEscalateReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: (id: string) => closePatientConversation(id),
    onSuccess: () => {
      toast.success("Conversation closed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // getPatientChatMessages uses api.list → data is { items, pagination }, so
  // the Mongo message array lives at `data.items` (its shape differs from
  // ChatMessage, hence the cast).
  const items = (messages.data?.items as unknown as PatientChatMessageView[] | undefined) ?? [];

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      <PageHeader
        title="Patient Chat"
        description={isPatient ? "Chat with the hospital team about your care." : "Patient conversations inbox — reply, escalate, or close."}
        actions={
          isPatient && (
            <Button onClick={() => setStartOpen(true)} disabled={start.isPending}>
              New conversation
            </Button>
          )
        }
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* Conversation list */}
        <div className="rounded-lg border border-border bg-card">
          <ScrollArea className="h-full">
            {conversations.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (conversations.data?.items ?? []).length === 0 ? (
              <EmptyState icon={MessageSquareHeartIcon} title="No conversations" description={isPatient ? "Start a conversation with the hospital team." : "Assigned patient conversations appear here."} />
            ) : (
              <div className="divide-y divide-border">
                {conversations.data?.items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-accent/50 ${activeId === c.id ? "bg-accent" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {isPatient ? c.department?.name ?? "Hospital" : c.patient?.name ?? "Patient"}
                      </p>
                      <Badge variant="outline">{c.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : "No messages yet"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Messages */}
        <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card">
          {!activeId ? (
            <EmptyState icon={MessageSquareHeartIcon} title="Select a conversation" description="Choose a conversation on the left to start reading." />
          ) : messages.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-2/3" />)}
            </div>
          ) : messages.isError ? (
            <ErrorState error={messages.error} onRetry={() => messages.refetch()} />
          ) : (
            <>
              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-3 p-4">
                  {items.map((m) => (
                    <div key={m._id} className={`flex ${m.senderId === myId ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                          m.senderId === myId ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
                        }`}
                      >
                        {m.senderId !== myId && (
                          <p className="mb-0.5 text-xs font-medium opacity-80">{m.senderType === "PATIENT" ? "Patient" : "Staff"}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`mt-1 text-[10px] ${m.senderId === myId ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <div className="flex items-center gap-2 border-t border-border p-3">
                <Button variant="outline" size="sm" onClick={() => setEscalateFor(activeId)}>Escalate</Button>
                <Button variant="ghost" size="sm" disabled={close.isPending} onClick={() => close.mutate(activeId)}>Close</Button>
                <form
                  onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send.mutate(draft.trim()); }}
                  className="ml-auto flex flex-1 items-center gap-2"
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message…"
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!draft.trim() || send.isPending}>
                    <SendIcon />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Patient: start conversation */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a conversation</DialogTitle>
            <DialogDescription>Choose a department to route your question to (optional).</DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-xs font-medium">Department (optional)</p>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue placeholder="Any department" /></SelectTrigger>
              <SelectContent>
                {(departments.data?.items ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button disabled={start.isPending} onClick={() => start.mutate(departmentId)}>
              {start.isPending ? "Starting…" : "Start chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate */}
      <Dialog open={!!escalateFor} onOpenChange={(o) => !o && setEscalateFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escalate conversation</DialogTitle>
            <DialogDescription>Escalation routes this thread for an appointment follow-up.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} placeholder="Reason (optional)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateFor(null)}>Cancel</Button>
            <Button disabled={escalate.isPending} onClick={() => escalateFor && escalate.mutate(escalateFor)}>
              {escalate.isPending ? "Escalating…" : "Escalate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
