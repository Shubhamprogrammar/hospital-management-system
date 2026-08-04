"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { MessageSquareIcon, SendIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import {
  createConversation, editChatMessage, getChatMessages, listConversations,
  markConversationRead, sendChatMessage,
} from "@/shared/services/chat.service";
import { listUsers } from "@/shared/services/users.service";
import { useSession } from "@/shared/lib/auth-client";
import { useSocketEvent } from "@/shared/lib/hooks/useSocket";
import { STAFF_CHAT_ROLES } from "@/shared/components/layout/nav-items";
import { hasRole, type Role } from "@/shared/types";
import type { ChatMessage } from "@/shared/types/domain";

export default function ChatPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: () => listConversations({ limit: 50 }),
  });

  const messages = useQuery({
    queryKey: ["chat", "messages", activeId],
    queryFn: () => getChatMessages(activeId!, { limit: 100 }),
    enabled: !!activeId,
  });

  // Mark a conversation as read when it is opened (FR 25.4 — read receipts).
  const read = useMutation({
    mutationFn: (conversationId: string) => markConversationRead(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] }),
  });

  const openConversation = (id: string) => {
    setActiveId(id);
    read.mutate(id);
  };

  const edit = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => editChatMessage(id, { content }),
    onSuccess: () => {
      toast.success("Message edited");
      setEditingId(null);
      setEditDraft("");
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useSocketEvent<{ conversationId: string }>("chat:message:new", (payload) => {
    if (payload.conversationId === activeId) {
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeId] });
    }
    queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data]);

  const start = useMutation({
    mutationFn: (participantIds: string[]) =>
      createConversation({ participantIds, type: "DIRECT", title: "General" }),
    onSuccess: (conv) => {
      setActiveId(conv.id);
      setPickerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (content: string) => sendChatMessage(activeId!, { content }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeId] });
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const myId = session?.user?.id;
  const canStartChat = hasRole(session?.user?.role as Role | undefined, ...STAFF_CHAT_ROLES);

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      <PageHeader
        title="Chat"
        description="Internal team conversations."
        actions={
          canStartChat && (
            <Button onClick={() => setPickerOpen(true)} disabled={start.isPending}>
              New conversation
            </Button>
          )
        }
      />

      <NewConversationDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        myId={myId ?? ""}
        onStart={(participantIds) => start.mutate(participantIds)}
        pending={start.isPending}
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* Conversation list */}
        <div className="rounded-lg border border-border bg-card">
          <ScrollArea className="h-full">
            {conversations.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : conversations.data?.items.length === 0 ? (
              <EmptyState icon={MessageSquareIcon} title="No conversations" description="Start a new conversation to begin chatting." />
            ) : (
              <div className="divide-y divide-border">
                {conversations.data?.items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-accent/50 ${activeId === c.id ? "bg-accent" : ""}`}
                  >
                    <p className="truncate text-sm font-medium">
                      {c.title ?? c.participants?.map((p) => p.user?.name).filter(Boolean).join(", ") ?? "Conversation"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastMessage ? c.lastMessage.content : new Date(c.createdAt).toLocaleDateString()}
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
            <EmptyState icon={MessageSquareIcon} title="Select a conversation" description="Choose a conversation on the left to start reading." />
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
                  {messages.data?.items.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      mine={m.senderId === myId}
                      editing={editingId === m.id}
                      editDraft={editDraft}
                      onStartEdit={() => { setEditingId(m.id); setEditDraft(m.content); }}
                      onCancelEdit={() => { setEditingId(null); setEditDraft(""); }}
                      onSaveEdit={() => editingId && editDraft.trim() && edit.mutate({ id: editingId, content: editDraft.trim() })}
                      onDraftChange={setEditDraft}
                    />
                  ))}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <form
                onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send.mutate(draft.trim()); }}
                className="flex items-center gap-2 border-t border-border p-3"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NewConversationDialog({
  open,
  onOpenChange,
  myId,
  onStart,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myId: string;
  onStart: (participantIds: string[]) => void;
  pending: boolean;
}) {
  const staff = useQuery({
    queryKey: ["users", "picker"],
    queryFn: () => listUsers({ limit: 100 }),
    enabled: open,
  });
  const [selected, setSelected] = useState<string[]>([]);

  const others = (staff.data?.items ?? []).filter((u) => u.id !== myId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reset the selection each time the dialog opens.
        if (next) setSelected([]);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Pick at least one teammate to start a direct chat. You are added automatically.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-72">
          <div className="space-y-1 pr-2">
            {staff.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
            ) : others.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No other staff found.</p>
            ) : (
              others.map((u) => {
                const active = selected.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() =>
                      setSelected((prev) => (active ? prev.filter((id) => id !== u.id) : [...prev, u.id]))
                    }
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                      active ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <span className="truncate text-sm font-medium">{u.name}</span>
                    <span className={`text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>
                      {u.role ?? u.email}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => onStart(selected)}
            disabled={pending || selected.length === 0}
          >
            {pending ? "Starting…" : `Start chat (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageBubble({
  message, mine, editing, editDraft, onStartEdit, onCancelEdit, onSaveEdit, onDraftChange,
}: {
  message: ChatMessage;
  mine: boolean;
  editing: boolean;
  editDraft: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDraftChange: (value: string) => void;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`group relative max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
        }`}
      >
        {!mine && (
          <p className="mb-0.5 text-xs font-medium opacity-80">{message.sender?.name ?? "User"}</p>
        )}
        {editing ? (
          <form
            onSubmit={(e) => { e.preventDefault(); onSaveEdit(); }}
            className="flex flex-col gap-2"
          >
            <Input autoFocus value={editDraft} onChange={(e) => onDraftChange(e.target.value)} className="h-8 text-sm" />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={!editDraft.trim()}>Save</Button>
              <Button size="sm" variant="ghost" type="button" onClick={onCancelEdit}>Cancel</Button>
            </div>
          </form>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        {message.editedAt && !editing && (
          <p className={`mt-0.5 text-[10px] ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>edited</p>
        )}
        <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
        {mine && !editing && (
          <button
            type="button"
            className="absolute -top-2 right-2 hidden rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm group-hover:block"
            onClick={onStartEdit}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
