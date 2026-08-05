"use client";

import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ChevronLeftIcon, ChevronRightIcon, Loader2Icon, LogOutIcon, MessageSquareIcon,
  PencilIcon, SearchIcon, SendIcon, Trash2Icon, UserPlusIcon, UsersIcon,
} from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import {
  addConversationMembers, conversationThreadStatus, createConversation,
  deleteConversation, editChatMessage, getChatMessages, leaveConversation,
  listChatUsers, listConversations, lookupConversation, markConversationRead,
  sendChatMessage, updateConversationTitle,
} from "@/shared/services/chat.service";
import { useSession } from "@/shared/lib/auth-client";
import { useSocket, useSocketEvent } from "@/shared/lib/hooks/useSocket";
import { STAFF_CHAT_ROLES } from "@/shared/components/layout/nav-items";
import { hasRole, type Role } from "@/shared/types";
import { cn } from "@/shared/lib/utils";
import type { ChatConversation, ChatMessage, ChatParticipant } from "@/shared/types/domain";

/** Older-history page size for the lazy loader (scroll-to-top loads another page). */
const MESSAGE_PAGE_SIZE = 30;

/** Lightweight user shape used by avatars/lists. */
interface ChatUserLite {
  id: string;
  name: string | null;
  image: string | null;
  role: string;
  email: string;
}

export default function ChatPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  // A freshly created conversation isn't in the refetched list yet, so hold it
  // as a fallback until the conversations query catches up.
  const [createdConv, setCreatedConv] = useState<ChatConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const conversations = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: () => listConversations({ limit: 50 }),
  });

  // Chat history is lazy-loaded: page 1 = most recent messages, older pages are
  // fetched on scroll-up (or via the "Load earlier messages" button).
  const messages = useInfiniteQuery({
    queryKey: ["chat", "messages", activeId],
    queryFn: ({ pageParam }) => getChatMessages(activeId!, { page: pageParam, limit: MESSAGE_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    enabled: !!activeId,
  });

  // Pages are newest-first (page 1 = latest) → render them oldest → newest and
  // de-dupe by id (offset pagination can shift when new messages arrive).
  const allMessages = useMemo(() => {
    const seen = new Set<string>();
    const out: ChatMessage[] = [];
    for (const page of [...(messages.data?.pages ?? [])].reverse()) {
      for (const m of page.items) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      }
    }
    return out;
  }, [messages.data]);

  // Mark a conversation as read when it is opened (FR 25.4 — read receipts).
  const read = useMutation({
    mutationFn: (conversationId: string) => markConversationRead(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] }),
  });

  const openConversation = (id: string) => {
    setActiveId(id);
    setInfoOpen(false);
    setCreatedConv(null);
    read.mutate(id);
  };

  // Active conversation derived from the list (stays fresh on refetch); the
  // created-conversation fallback covers the window before the list updates.
  const activeConv = useMemo(() => {
    if (!activeId) return null;
    return conversations.data?.items.find((x) => x.id === activeId) ?? createdConv;
  }, [activeId, conversations.data, createdConv]);

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

  const socket = useSocket();

  // Join the active conversation room so server-side room broadcasts reach us.
  useEffect(() => {
    if (!socket || !activeId) return;
    socket.emit("join-conversation", activeId);
    return () => {
      socket.emit("leave-conversation", activeId);
    };
  }, [socket, activeId]);

  // Event names must match the server emits (chat:message-new / chat:message-edited).
  useSocketEvent<{ conversationId: string }>("chat:message-new", (payload) => {
    if (payload.conversationId === activeId) {
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeId] });
    }
    queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
  });

  useSocketEvent<{ conversationId: string }>("chat:message-edited", (payload) => {
    if (payload.conversationId === activeId) {
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeId] });
    }
  });

  // A group was renamed / members changed by someone — refresh titles/headers everywhere.
  useSocketEvent("chat:conversation-updated", () => {
    queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
  });

  // A group was deleted (by anyone) — drop it from the list, close if active.
  useSocketEvent<{ id: string }>("chat:conversation-deleted", (payload) => {
    if (payload.id === activeId) {
      setActiveId(null);
      setInfoOpen(false);
    }
    queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
  });

  // ---- Lazy history loading + scroll anchoring --------------------------------
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollAnchor = useRef<number | null>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    stickToBottom.current = true;
    scrollAnchor.current = null;
  }, [activeId]);

  const handleMessagesScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (
      el.scrollTop < 48 &&
      el.scrollHeight > el.clientHeight + 48 &&
      messages.hasNextPage &&
      !messages.isFetchingNextPage
    ) {
      scrollAnchor.current = el.scrollHeight;
      messages.fetchNextPage();
    }
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (scrollAnchor.current != null) {
      el.scrollTop = el.scrollHeight - scrollAnchor.current;
      scrollAnchor.current = null;
      return;
    }
    if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.data]);

  const start = useMutation({
    mutationFn: (opts: { participantIds: string[]; title?: string; type?: "DIRECT" | "GROUP" }) =>
      createConversation(opts),
    onSuccess: ({ conversation, reused }) => {
      setActiveId(conversation.id);
      setCreatedConv(conversation);
      setPickerOpen(false);
      if (reused) {
        toast("Continuing existing conversation", { duration: 2500 });
      }
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["chat", "lookup"] });
      queryClient.invalidateQueries({ queryKey: ["chat", "thread-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (content: string) => sendChatMessage(activeId!, { content }),
    onSuccess: () => {
      setDraft("");
      stickToBottom.current = true;
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", activeId] });
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const myId = session?.user?.id;
  const canStartChat = hasRole(session?.user?.role as Role | undefined, ...STAFF_CHAT_ROLES);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        activeId ? "h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-8rem)]" : "h-[calc(100dvh-8rem)]",
      )}
    >
      {/* Hide the global header on mobile while inside a chat (WhatsApp-style). */}
      <div className={cn(activeId && "hidden lg:block")}>
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
      </div>

      <NewConversationDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        myId={myId ?? ""}
        onStart={(opts) => start.mutate(opts)}
        pending={start.isPending}
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* Conversation list — hidden on mobile once a chat is open. */}
        <div className={cn("rounded-lg border border-border bg-card", activeId && "hidden lg:block")}>
          <ScrollArea className="h-full">
            {conversations.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : conversations.data?.items.length === 0 ? (
              <EmptyState icon={MessageSquareIcon} title="No conversations" description="Start a new conversation to begin chatting." />
            ) : (
              <div className="divide-y divide-border">
                {conversations.data?.items.map((c) => (
                  <ConversationListItem
                    key={c.id}
                    conversation={c}
                    active={activeId === c.id}
                    myId={myId ?? ""}
                    onClick={() => openConversation(c.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat window — fills the screen on mobile when a conversation is open. */}
        <div
          className={cn(
            "flex min-w-0 flex-col rounded-lg border border-border bg-card",
            !activeId && "hidden lg:flex",
          )}
        >
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
              {activeConv && (
                <ConversationHeader
                  conversation={activeConv}
                  myId={myId ?? ""}
                  onBack={() => setActiveId(null)}
                  onOpenInfo={() => setInfoOpen(true)}
                />
              )}
              <ScrollArea
                viewportRef={viewportRef}
                onScroll={handleMessagesScroll}
                className="flex-1"
              >
                <div className="flex flex-col gap-3 p-4">
                  {messages.hasNextPage && (
                    <div className="flex justify-center py-1">
                      {messages.isFetchingNextPage ? (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2Icon className="size-3.5 animate-spin" /> Loading earlier messages…
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                          onClick={() => {
                            const el = viewportRef.current;
                            scrollAnchor.current = el ? el.scrollHeight : null;
                            messages.fetchNextPage();
                          }}
                        >
                          Load earlier messages
                        </Button>
                      )}
                    </div>
                  )}
                  {allMessages.map((m) => (
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

      <ConversationInfoSheet
        open={infoOpen}
        onOpenChange={setInfoOpen}
        conversation={activeConv}
        myId={myId ?? ""}
        onRemoved={() => {
          setActiveId(null);
          setInfoOpen(false);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation list item
// ---------------------------------------------------------------------------

function ConversationListItem({
  conversation: c,
  active,
  myId,
  onClick,
}: {
  conversation: ChatConversation;
  active: boolean;
  myId: string;
  onClick: () => void;
}) {
  const others = getOtherParticipants(c, myId);
  const isGroup = (c.participants?.length ?? 0) > 2;
  const avatarUsers = isGroup
    ? (c.participants ?? []).map((p) => p.user).filter((u): u is ChatUserLite => !!u)
    : others.map((p) => p.user).filter((u): u is ChatUserLite => !!u);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50 ${active ? "bg-accent" : ""}`}
    >
      <AvatarStack users={avatarUsers} max={isGroup ? 2 : 1} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{conversationTitle(c, myId)}</p>
          {c.lastMessage && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatTime(c.lastMessage.createdAt)}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {c.lastMessage ? c.lastMessage.content : `${(c.participants?.length ?? 0)} members`}
        </p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chat header (WhatsApp-style) + member sheet
// ---------------------------------------------------------------------------

function ConversationHeader({
  conversation: c,
  myId,
  onBack,
  onOpenInfo,
}: {
  conversation: ChatConversation;
  myId: string;
  onBack: () => void;
  onOpenInfo: () => void;
}) {
  const participants = c.participants ?? [];
  const others = getOtherParticipants(c, myId);
  const isGroup = participants.length > 2;
  const avatarUsers = isGroup
    ? participants.map((p) => p.user).filter((u): u is ChatUserLite => !!u)
    : others.map((p) => p.user).filter((u): u is ChatUserLite => !!u);
  const subtitle = isGroup
    ? `${participants.length} members`
    : (others[0]?.user?.role ? formatRole(others[0].user.role) : "Member");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenInfo}
      onKeyDown={(e) => { if (e.key === "Enter") onOpenInfo(); }}
      className="flex w-full cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
    >
      <Button
        variant="ghost"
        size="icon"
        className="-ml-1 shrink-0 lg:hidden"
        aria-label="Back to conversations"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBack(); }}
      >
        <ChevronLeftIcon />
      </Button>
      <AvatarStack users={avatarUsers} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{conversationTitle(c, myId)}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/50" />
    </div>
  );
}

function ConversationInfoSheet({
  open,
  onOpenChange,
  conversation,
  myId,
  onRemoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: ChatConversation | null;
  myId: string;
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const participants = conversation?.participants ?? [];
  const isGroup = participants.length > 2;
  const [confirm, setConfirm] = useState<"exit" | "delete" | null>(null);

  const rename = useMutation({
    mutationFn: (title: string) => updateConversationTitle(conversation!.id, { title }),
    onSuccess: () => {
      toast.success("Group renamed");
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leave = useMutation({
    mutationFn: () => leaveConversation(conversation!.id),
    onSuccess: () => {
      toast.success("You left the group");
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      onRemoved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteConversation(conversation!.id),
    onSuccess: () => {
      toast.success("Group deleted");
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      onRemoved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border px-6 pt-6 pb-4">
          <SheetTitle>{isGroup ? "Conversation members" : "Conversation"}</SheetTitle>
          <SheetDescription>
            {isGroup ? `${participants.length} members` : "Direct chat"}
          </SheetDescription>
        </SheetHeader>

        {isGroup && conversation && (
          <div className="border-b border-border px-6 py-4">
            <GroupNameEditor
              key={conversation.id}
              title={conversation.title}
              pending={rename.isPending}
              onRename={(title) => rename.mutate(title)}
            />
          </div>
        )}

        {isGroup && conversation && (
          <div className="border-b border-border px-6 py-4">
            <AddMembersSection conversation={conversation} myId={myId} />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-6 pt-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {participants.length} member{participants.length === 1 ? "" : "s"}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-3 pt-1">
              {participants.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No members to show.</p>
              )}
              {participants.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
                  <UserAvatar user={p.user ?? undefined} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.user?.name ?? "User"}
                      {p.userId === myId && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">(You)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{p.user?.email ?? "—"}</p>
                  </div>
                  {p.user?.role && (
                    <Badge variant="outline" className="shrink-0">{formatRole(p.user.role)}</Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {isGroup && conversation && (
          <div className="grid gap-2 border-t border-border p-4">
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
              onClick={() => setConfirm("exit")}
            >
              <LogOutIcon /> Exit group
            </Button>
            <Button variant="destructive" onClick={() => setConfirm("delete")}>
              <Trash2Icon /> Delete group
            </Button>
          </div>
        )}
      </SheetContent>

      <ConfirmDialog
        open={confirm === "exit"}
        onOpenChange={(next) => !next && setConfirm(null)}
        title="Exit group?"
        description="You will no longer see this group or its messages. You can be re-added by any member."
        confirmLabel="Exit group"
        pending={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(next) => !next && setConfirm(null)}
        title="Delete this group?"
        description="This permanently deletes the group and its message history for all members. This cannot be undone."
        confirmLabel="Delete group"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Sheet>
  );
}

/** Inline editor for the group name (display mode + edit mode with save/cancel). */
function GroupNameEditor({
  title,
  pending,
  onRename,
}: {
  title: string | null;
  pending: boolean;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title ?? "");

  const current = title ?? "";
  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== current;

  const startEditing = () => {
    setDraft(current);
    setEditing(true);
  };
  const save = () => {
    if (!canSave) return;
    onRename(trimmed);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Group name</p>
          <p className="truncate text-sm font-medium">{current || "Unnamed group"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={startEditing}>
          <PencilIcon className="mr-1.5 size-3.5" />
          Rename
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">Group name</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="mt-1.5 flex gap-2"
      >
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Group name"
          maxLength={60}
          className="h-9 flex-1"
        />
        <Button type="submit" size="sm" disabled={pending || !canSave}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    </div>
  );
}

/** Staff picker for adding members to a group conversation. */
function AddMembersSection({
  conversation,
  myId,
}: {
  conversation: ChatConversation;
  myId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // Debounce the search box so autocomplete queries fire at most every 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const memberIds = useMemo(
    () => new Set((conversation.participants ?? []).map((p) => p.userId)),
    [conversation.participants],
  );

  const candidates = useQuery({
    queryKey: ["chat", "users", { search: debounced }],
    queryFn: () => listChatUsers({ search: debounced || undefined }),
    enabled: open,
  });
  const nonMembers = (candidates.data?.items ?? []).filter((u) => u.id !== myId && !memberIds.has(u.id));

  const add = useMutation({
    mutationFn: (userIds: string[]) => addConversationMembers(conversation.id, { userIds }),
    onSuccess: () => {
      toast.success("Members added");
      setSelected([]);
      setSearch("");
      setDebounced("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Members</p>
          <p className="truncate text-sm font-medium">{(conversation.participants ?? []).length} in this group</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          <UserPlusIcon className="mr-1.5 size-3.5" />
          {open ? "Cancel" : "Add members"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff to add…"
              className="h-9 pl-8"
            />
          </div>

          <ScrollArea className="max-h-44 rounded-lg border border-border">
            <div className="space-y-0.5 p-1.5">
              {candidates.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
              ) : nonMembers.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {debounced ? "No other staff match your search." : "Everyone on the team is already in this group."}
                </p>
              ) : (
                nonMembers.map((u) => (
                  <div
                    key={u.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(u.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") toggle(u.id); }}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 ${
                      selected.includes(u.id) ? "bg-accent" : ""
                    }`}
                  >
                    <Checkbox checked={selected.includes(u.id)} />
                    <span className="min-w-0 flex-1 truncate">{u.name ?? u.email}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatRole(u.role)}</span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <Button
            size="sm"
            className="w-full"
            onClick={() => add.mutate(selected)}
            disabled={selected.length === 0 || add.isPending}
          >
            {add.isPending ? "Adding…" : `Add selected (${selected.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Small confirmation dialog used for destructive group actions. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Please wait…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

function UserAvatar({ user, className }: { user?: ChatUserLite | null; className?: string }) {
  const name = user?.name ?? "User";
  return (
    <Avatar className={cn("size-9 shrink-0 border-2 border-card", className)}>
      {user?.image ? <AvatarImage src={user.image} alt={name} /> : null}
      <AvatarFallback>{name.trim().charAt(0).toUpperCase() || "?"}</AvatarFallback>
    </Avatar>
  );
}

/** WhatsApp-style overlapping avatar stack for group chats. */
function AvatarStack({ users, max = 3 }: { users: ChatUserLite[]; max?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <div className="flex shrink-0 -space-x-2.5">
      {shown.map((u) => <UserAvatar key={u.id} user={u} />)}
      {extra > 0 && (
        <span className="flex size-9 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New conversation dialog
// ---------------------------------------------------------------------------

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
  onStart: (opts: { participantIds: string[]; title?: string; type?: "DIRECT" | "GROUP" }) => void;
  pending: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState("all");
  const [groupName, setGroupName] = useState("");

  // Selecting 2+ people (3+ including you) turns this into a group chat.
  const isGroup = selected.length >= 2;
  const groupNameTrimmed = groupName.trim();

  // Debounce the search box so autocomplete queries fire at most every 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const staff = useQuery({
    queryKey: ["chat", "users", { search: debounced, role }],
    queryFn: () =>
      listChatUsers({
        search: debounced || undefined,
        role: role === "all" ? undefined : role,
      }),
    enabled: open,
  });

  const others = (staff.data?.items ?? []).filter((u) => u.id !== myId);

  // Does the currently selected member set already have a thread? If so,
  // starting will resume it rather than create a new one.
  const selectedKey = [...selected].sort().join("|");
  const existing = useQuery({
    queryKey: ["chat", "lookup", myId, selectedKey],
    queryFn: () => lookupConversation([...selected, myId]),
    enabled: open && !!myId && selected.length > 0,
    staleTime: 30_000,
  });
  const willContinue = !!existing.data?.conversation;

  // A name is only required for a brand-new group — when resuming an existing
  // thread the server returns it as-is, so forcing a name would be misleading.
  const nameRequired = isGroup && !willContinue;
  const canStart = selected.length > 0 && (!nameRequired || groupNameTrimmed.length > 0);

  // Per-person badge: which selected people already have a 1:1 thread with me.
  const threadStatus = useQuery({
    queryKey: ["chat", "thread-status", myId, selectedKey],
    queryFn: () => conversationThreadStatus(selected),
    enabled: open && !!myId && selected.length > 0,
    staleTime: 30_000,
  });
  const hasThreadByUser = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const s of threadStatus.data?.items ?? []) map.set(s.userId, s.hasExistingThread);
    return map;
  }, [threadStatus.data]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reset search/selection each time the dialog opens.
        if (next) {
          setSelected([]);
          setSearch("");
          setDebounced("");
          setRole("all");
          setGroupName("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isGroup ? "New group conversation" : "New conversation"}</DialogTitle>
          <DialogDescription>
            Pick one teammate for a direct chat, or two or more to create a group. You are added automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Autocomplete search */}
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-9"
            />
          </div>

          {/* Role filter */}
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {STAFF_CHAT_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{formatRole(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Group name — required once 2+ people are selected (3+ total), unless an existing thread is being resumed. */}
          {nameRequired && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <label htmlFor="group-name" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <UsersIcon className="size-3.5 text-primary" />
                Group name
              </label>
              <Input
                id="group-name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={`Group with ${selected.length} people`}
                maxLength={60}
                className="mt-1.5"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Give this group a name so members can find it easily.
              </p>
            </div>
          )}
        </div>

        <ScrollArea className="max-h-72">
          <div className="space-y-1 pr-2">
            {staff.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : others.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {debounced || role !== "all" ? "No staff match your search." : "No other staff found."}
              </p>
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
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                      active ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={{ id: u.id, name: u.name, image: u.image, role: u.role, email: u.email }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          <Highlight text={u.name ?? u.email} query={debounced} />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {active && hasThreadByUser.get(u.id) && (
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          Existing chat
                        </Badge>
                      )}
                      <Badge variant="outline" className="shrink-0">{formatRole(u.role)}</Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          {selected.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Pick at least one teammate to continue.</span>
            </p>
          ) : nameRequired && !groupNameTrimmed ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <UsersIcon className="size-3.5 shrink-0" />
              Please enter a name for this group.
            </p>
          ) : existing.isSuccess ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageSquareIcon className="size-3.5 shrink-0" />
              {willContinue
                ? "Existing chat — will continue"
                : "A new conversation will be created"}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() =>
                onStart({
                  participantIds: selected,
                  type: isGroup ? "GROUP" : "DIRECT",
                  title: isGroup ? groupNameTrimmed : undefined,
                })
              }
              disabled={pending || !canStart}
            >
              {pending ? "Starting…" : isGroup ? "Create group" : "Start chat"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a role key (e.g. LAB_TECHNICIAN) into a readable label (Lab Technician). */
function formatRole(role: string): string {
  return role.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getOtherParticipants(c: ChatConversation, myId: string): ChatParticipant[] {
  return (c.participants ?? []).filter((p) => p.userId !== myId);
}

function conversationTitle(c: ChatConversation, myId: string): string {
  if (c.title) return c.title;
  const names = getOtherParticipants(c, myId).map((p) => p.user?.name).filter(Boolean);
  return names.length ? names.join(", ") : "Conversation";
}

/** Bold-highlights the part of `text` that matches `query` (autocomplete feel). */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-primary">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
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
          <p className="mb-0.5 text-xs font-medium opacity-80">
            {message.sender?.name ?? "User"}
            {message.sender?.role ? ` · ${formatRole(message.sender.role)}` : ""}
          </p>
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
          {formatTime(message.createdAt)}
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
