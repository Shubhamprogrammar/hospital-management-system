"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { SettingsIcon } from "lucide-react";

import { PageHeader } from "@/shared/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import {
  getBusinessRules, getHospitalProfile, listFeatureFlags, toggleFeatureFlag, updateHospitalProfile, updateBusinessRule,
} from "@/shared/services/platform.service";

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const profile = useQuery({ queryKey: ["settings", "profile"], queryFn: () => getHospitalProfile() });
  const rules = useQuery({ queryKey: ["settings", "rules"], queryFn: () => getBusinessRules() });
  const flags = useQuery({ queryKey: ["settings", "flags"], queryFn: () => listFeatureFlags() });

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
    </div>
  );
}
