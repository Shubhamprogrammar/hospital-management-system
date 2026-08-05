"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { BellIcon, FileTextIcon, PlusIcon, Settings2Icon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import {
  createNotificationTemplate, listNotificationTemplates, listNotifications,
  getNotificationPreferences, updateNotificationPreferences,
} from "@/shared/services/notifications.service";
import { useSession } from "@/shared/lib/auth-client";
import { ROLES, hasRole, type Role } from "@/shared/types";

const CHANNELS = ["SMS", "EMAIL", "PUSH", "IN_APP"] as const;

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const isAdmin = hasRole(role, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN);

  const [templateOpen, setTemplateOpen] = useState(false);

  const inbox = useQuery({ queryKey: ["notifications", "inbox"], queryFn: () => listNotifications(1, 50) });
  const preferences = useQuery({ queryKey: ["notifications", "preferences"], queryFn: () => getNotificationPreferences() });
  const templates = useQuery({ queryKey: ["notifications", "templates"], queryFn: () => listNotificationTemplates(), enabled: isAdmin });

  const savePreferences = useMutation({
    mutationFn: (input: Array<{ category: string; channel: "SMS" | "EMAIL" | "PUSH" | "IN_APP"; isEnabled: boolean }>) =>
      updateNotificationPreferences(input),
    onSuccess: () => { toast.success("Preferences saved"); queryClient.invalidateQueries({ queryKey: ["notifications"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Notifications" description="Inbox, delivery preferences, and notification templates." />

      <Tabs defaultValue="inbox">
        <TabsList className="mb-4">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          {isAdmin && <TabsTrigger value="templates">Templates</TabsTrigger>}
        </TabsList>

        <TabsContent value="inbox">
          <Card>
            <CardContent className="px-0 py-0">
              {inbox.isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : inbox.isError ? (
                <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} />
              ) : (inbox.data?.items ?? []).length === 0 ? (
                <EmptyState icon={BellIcon} title="No notifications" description="Notifications you receive appear here." />
              ) : (
                <ul className="divide-y divide-border">
                  {inbox.data?.items.map((n) => (
                    <li key={n.id} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div>
                        <p className={`text-sm ${n.status === "READ" ? "text-muted-foreground" : "font-medium"}`}>
                          {n.templateKey}
                        </p>
                        {n.payload && Object.keys(n.payload).length > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {JSON.stringify(n.payload).slice(0, 140)}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {n.channel} · {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={n.status === "FAILED" ? "destructive" : "outline"}>{n.status.replace(/_/g, " ")}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader><CardTitle>Delivery preferences</CardTitle></CardHeader>
            <CardContent>
              {preferences.isLoading ? (
                <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : preferences.isError ? (
                <ErrorState error={preferences.error} />
              ) : (preferences.data ?? []).length === 0 ? (
                <EmptyState icon={Settings2Icon} title="No preferences yet" />
              ) : (
                <div className="space-y-2">
                  {preferences.data?.map((p) => (
                    <label
                      key={`${p.category}-${p.channel}`}
                      className="flex items-center justify-between rounded-md border border-border px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{p.category.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">via {p.channel}</p>
                      </div>
                      <Switch
                        checked={p.isEnabled}
                        onCheckedChange={(checked) => {
                          const updated = (preferences.data ?? []).map((pref) =>
                            pref.category === p.category && pref.channel === p.channel
                              ? { ...pref, isEnabled: checked }
                              : pref,
                          );
                          savePreferences.mutate(updated.map((u) => ({ category: u.category, channel: u.channel, isEnabled: u.isEnabled })));
                          queryClient.setQueryData(["notifications", "preferences"], updated);
                        }}
                        disabled={savePreferences.isPending}
                      />
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="templates">
            <div className="mb-4 flex justify-end">
              <Button onClick={() => setTemplateOpen(true)}><PlusIcon /> Create template</Button>
            </div>
            <Card>
              <CardContent className="px-0 py-0">
                {templates.isLoading ? (
                  <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : templates.isError ? (
                  <ErrorState error={templates.error} />
                ) : (templates.data ?? []).length === 0 ? (
                  <EmptyState icon={FileTextIcon} title="No templates" description="Create notification templates for SMS/email/push." />
                ) : (
                  <ul className="divide-y divide-border">
                    {templates.data?.map((t) => (
                      <li key={t.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <code>{t.key}</code>
                            <Badge variant="outline">{t.channel}</Badge>
                            {t.isCritical && <Badge variant="warning">critical</Badge>}
                          </p>
                          {t.subject && <span className="text-xs text-muted-foreground">{t.subject}</span>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.bodyTemplate}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <CreateTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
    </div>
  );
}

function CreateTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState({ key: "", channel: "EMAIL" as (typeof CHANNELS)[number], subject: "", bodyTemplate: "", isCritical: false });

  const create = useMutation({
    mutationFn: () =>
      createNotificationTemplate({
        key: v.key.trim(),
        channel: v.channel,
        subject: v.subject.trim() || undefined,
        bodyTemplate: v.bodyTemplate.trim(),
        isCritical: v.isCritical,
      }),
    onSuccess: () => {
      toast.success("Template created");
      setV({ key: "", channel: "EMAIL", subject: "", bodyTemplate: "", isCritical: false });
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = v.key.trim() && v.bodyTemplate.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create template</DialogTitle>
          <DialogDescription>Define a reusable notification template.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Template key</Label>
              <Input className="mt-1" placeholder="APPOINTMENT_REMINDER" value={v.key} onChange={(e) => setV((p) => ({ ...p, key: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={v.channel} onValueChange={(c) => setV((p) => ({ ...p, channel: c as (typeof CHANNELS)[number] }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Subject (email only)</Label>
              <Input className="mt-1" value={v.subject} onChange={(e) => setV((p) => ({ ...p, subject: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Body template</Label>
              <Textarea className="mt-1" rows={4} placeholder="Dear {{name}}, your appointment is confirmed for {{date}}…" value={v.bodyTemplate} onChange={(e) => setV((p) => ({ ...p, bodyTemplate: e.target.value }))} />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={v.isCritical} onChange={(e) => setV((p) => ({ ...p, isCritical: e.target.checked }))} />
              Critical (bypasses quiet hours)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : "Create template"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
