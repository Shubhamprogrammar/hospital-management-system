"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { SettingsIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/components/ui/dialog";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import {
  getBusinessRules, getHospitalProfile, getIntegrationCredentials, listFeatureFlags,
  setIntegrationCredential, toggleFeatureFlag, updateHospitalProfile, updateBusinessRule,
} from "@/shared/services/platform.service";
import { listMySessions, revokeSession, updateMe } from "@/shared/services/users.service";
import { useSession } from "@/shared/lib/auth-client";
import type { IntegrationProvider } from "@/shared/types/domain";

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const profile = useQuery({ queryKey: ["settings", "profile"], queryFn: () => getHospitalProfile() });
  const rules = useQuery({ queryKey: ["settings", "rules"], queryFn: () => getBusinessRules() });
  const flags = useQuery({ queryKey: ["settings", "flags"], queryFn: () => listFeatureFlags() });
  const integrations = useQuery({ queryKey: ["settings", "integrations"], queryFn: () => getIntegrationCredentials() });

  const saveProfile = useMutation({
    mutationFn: (input: { name: string; taxId?: string }) => updateHospitalProfile(input),
    onSuccess: () => { toast.success("Profile updated"); queryClient.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFlag = useMutation({
    mutationFn: ({ key, isEnabled }: { key: string; isEnabled: boolean }) => toggleFeatureFlag(key, { isEnabled }),
    onSuccess: () => { toast.success("Flag updated"); queryClient.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRule = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => updateBusinessRule(key, { value }),
    onSuccess: () => { toast.success("Rule updated"); queryClient.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: session } = useSession();
  const myUser = session?.user;
  const [configuring, setConfiguring] = useState<IntegrationProvider | null>(null);

  const sessions = useQuery({ queryKey: ["auth", "sessions"], queryFn: () => listMySessions() });

  const saveMe = useMutation({
    mutationFn: (input: { name: string; phone?: string }) => updateMe(input),
    onSuccess: () => { toast.success("Profile updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (sessionId: string) => revokeSession(sessionId),
    onSuccess: () => {
      toast.success("Session revoked");
      queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveIntegration = useMutation({
    mutationFn: ({ provider, config }: { provider: IntegrationProvider; config: Record<string, string> }) =>
      setIntegrationCredential(provider, { config }),
    onSuccess: () => { toast.success("Integration keys updated"); setConfiguring(null); queryClient.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Settings" description="Hospital profile, business rules, and feature flags." />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hospital profile */}
        <Card>
          <CardHeader><CardTitle>Hospital profile</CardTitle></CardHeader>
          <CardContent>
            {profile.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : profile.isError ? (
              <ErrorState error={profile.error} />
            ) : profile.data ? (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  saveProfile.mutate({ name: String(formData.get("name")), taxId: String(formData.get("taxId") ?? "") });
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Hospital name</Label>
                  <Input id="name" name="name" defaultValue={profile.data.name} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="taxId">Tax ID</Label>
                  <Input id="taxId" name="taxId" defaultValue={profile.data.taxId ?? ""} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Registration no.</Label>
                  <Input value={profile.data.registrationNo ?? "—"} disabled />
                </div>
                <Button type="submit" className="w-fit" disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? "Saving…" : "Save profile"}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        {/* Business rules */}
        <Card>
          <CardHeader><CardTitle>Business rules</CardTitle></CardHeader>
          <CardContent>
            {rules.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : rules.isError ? (
              <ErrorState error={rules.error} />
            ) : rules.data?.length === 0 ? (
              <EmptyState icon={SettingsIcon} title="No business rules" />
            ) : (
              <div className="space-y-3">
                {rules.data?.map((rule) => {
                  const raw = typeof rule.value === "object" ? JSON.stringify(rule.value) : String(rule.value);
                  return (
                    <div key={rule.id} className="flex items-center gap-2">
                      <code className="w-40 shrink-0 truncate rounded bg-muted px-2 py-1 text-xs">{rule.key}</code>
                      <Input
                        defaultValue={raw}
                        className="h-8 flex-1 font-mono text-xs"
                        onBlur={(e) => {
                          if (e.target.value !== raw) {
                            let parsed: unknown = e.target.value;
                            try { parsed = JSON.parse(e.target.value); } catch { /* keep string */ }
                            saveRule.mutate({ key: rule.key, value: parsed });
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feature flags */}
      <Card className="mt-6">
        <CardHeader><CardTitle>Feature flags</CardTitle></CardHeader>
        <CardContent>
          {flags.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : flags.isError ? (
            <ErrorState error={flags.error} />
          ) : flags.data?.length === 0 ? (
            <EmptyState icon={SettingsIcon} title="No feature flags" />
          ) : (
            <div className="space-y-3">
              {flags.data?.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <code>{flag.key}</code>
                      <Badge variant={flag.isEnabled ? "success" : "secondary"}>{flag.isEnabled ? "On" : "Off"}</Badge>
                    </p>
                    {flag.description && <p className="mt-0.5 text-xs text-muted-foreground">{flag.description}</p>}
                  </div>
                  <Switch
                    checked={flag.isEnabled}
                    onCheckedChange={(checked) => toggleFlag.mutate({ key: flag.key, isEnabled: checked })}
                    disabled={toggleFlag.isPending}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card className="mt-6">
        <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
        <CardContent>
          {integrations.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : integrations.isError ? (
            <ErrorState error={integrations.error} />
          ) : (integrations.data ?? []).length === 0 ? (
            <EmptyState icon={SettingsIcon} title="No integrations configured" description="Configure SMS, email, payment gateway, or AI providers." />
          ) : (
            <div className="space-y-3">
              {(integrations.data ?? []).map((cred) => (
                <div key={cred.id} className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <code>{cred.provider.replace(/_/g, " ")}</code>
                      <Badge variant="success">configured</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Updated {new Date(cred.updatedAt).toLocaleString()}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setConfiguring(cred.provider)}>Update keys</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My account (self-service profile update) */}
      <Card className="mt-6">
        <CardHeader><CardTitle>My account</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid max-w-lg gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              saveMe.mutate({ name: String(formData.get("name")), phone: String(formData.get("phone") ?? "") || undefined });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="me-name">Full name</Label>
              <Input id="me-name" name="name" defaultValue={myUser?.name ?? ""} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="me-phone">Phone</Label>
              <Input id="me-phone" name="phone" defaultValue={myUser?.phone ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input value={myUser?.email ?? ""} disabled />
            </div>
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Input value={(myUser?.role ?? "").replace(/_/g, " ")} disabled />
            </div>
            <Button type="submit" className="w-fit" disabled={saveMe.isPending}>
              {saveMe.isPending ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* My active sessions */}
      <Card className="mt-6">
        <CardHeader><CardTitle>My sessions</CardTitle></CardHeader>
        <CardContent>
          {sessions.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : sessions.isError ? (
            <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
          ) : (sessions.data ?? []).length === 0 ? (
            <EmptyState icon={SettingsIcon} title="No active sessions" />
          ) : (
            <div className="space-y-2">
              {sessions.data?.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.userAgent || "Unknown device"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.ipAddress ?? "Unknown IP"} · signed in {new Date(s.createdAt).toLocaleString()} · expires {new Date(s.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-destructive"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {configuring && (
        <IntegrationDialog
          provider={configuring}
          pending={saveIntegration.isPending}
          onClose={() => setConfiguring(null)}
          onSubmit={(config) => saveIntegration.mutate({ provider: configuring, config })}
        />
      )}
    </div>
  );
}

function IntegrationDialog({
  provider, pending, onClose, onSubmit,
}: {
  provider: IntegrationProvider;
  pending: boolean;
  onClose: () => void;
  onSubmit: (config: Record<string, string>) => void;
}) {
  const [rows, setRows] = useState<Array<{ key: string; value: string }>>([{ key: "apiKey", value: "" }]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {provider.replace(/_/g, " ")}</DialogTitle>
          <DialogDescription>Credentials are stored encrypted and never returned.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input placeholder="Key (e.g. apiKey)" value={row.key} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))} />
              <Input placeholder="Value" type="password" value={row.value} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))} />
              <Button variant="ghost" size="icon" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))} aria-label="Remove">×</Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows((prev) => [...prev, { key: "", value: "" }])}>+ Add key</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || rows.some((r) => !r.key.trim())}
            onClick={() => {
              const config: Record<string, string> = {};
              for (const r of rows) if (r.key.trim()) config[r.key.trim()] = r.value;
              onSubmit(config);
            }}
          >
            Save keys
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
