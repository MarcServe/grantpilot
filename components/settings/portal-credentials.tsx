"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface PortalCredential {
  id: string;
  portalHost: string;
  portalName: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

const KNOWN_PORTALS = [
  { host: "apply-for-innovation-funding.service.gov.uk", name: "Innovate UK IFS" },
  { host: "find-government-grants.service.gov.uk", name: "Find a Grant" },
  { host: "funding-service.ukri.org", name: "UKRI Funding Service" },
  { host: "artsculturefinanceonline.org.uk", name: "Arts Council England (Grantium)" },
];

export function PortalCredentialsManager() {
  const [credentials, setCredentials] = useState<PortalCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [selectedPortal, setSelectedPortal] = useState("");
  const [customHost, setCustomHost] = useState("");
  const [customName, setCustomName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch("/api/portal-credentials");
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.credentials ?? []);
      }
    } catch {
      toast.error("Failed to load portal credentials");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleSave = async () => {
    const portal = KNOWN_PORTALS.find((p) => p.host === selectedPortal);
    const portalHost = portal?.host || customHost.trim();
    const portalName = portal?.name || customName.trim();

    if (!portalHost || !username.trim() || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/portal-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalHost, portalName: portalName || portalHost, username: username.trim(), password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      toast.success("Portal credential saved");
      setShowAddForm(false);
      resetForm();
      fetchCredentials();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save credential");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/portal-credentials?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Credential removed");
      fetchCredentials();
    } catch {
      toast.error("Failed to delete credential");
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setSelectedPortal("");
    setCustomHost("");
    setCustomName("");
    setUsername("");
    setPassword("");
    setShowPassword(false);
  };

  const isCustom = selectedPortal === "__custom__";
  const existingHosts = new Set(credentials.map((c) => c.portalHost));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          Portal Credentials
        </CardTitle>
        <CardDescription>
          Save grant portal credentials for future Version 2 login-assisted workflows. Version 1 uses these only as
          stored credentials; users still review and submit on the funder site. Passwords are encrypted at rest with
          AES-256-GCM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {credentials.length > 0 && (
              <div className="space-y-2">
                {credentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex items-center justify-between rounded-md border px-4 py-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">{cred.portalName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {cred.username} &middot; {cred.portalHost}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(cred.id)}
                      disabled={deletingId === cred.id}
                    >
                      {deletingId === cred.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {credentials.length === 0 && !showAddForm && (
              <p className="text-sm text-muted-foreground">
                No portal credentials saved yet. Add one only when you want to test future portal-login workflows.
              </p>
            )}

            {showAddForm ? (
              <div className="rounded-md border p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Portal</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedPortal}
                    onChange={(e) => setSelectedPortal(e.target.value)}
                  >
                    <option value="">Select a portal…</option>
                    {KNOWN_PORTALS.filter((p) => !existingHosts.has(p.host)).map((p) => (
                      <option key={p.host} value={p.host}>
                        {p.name}
                      </option>
                    ))}
                    <option value="__custom__">Other portal…</option>
                  </select>
                </div>

                {isCustom && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Portal hostname</Label>
                      <Input
                        placeholder="e.g. grants.example.gov.uk"
                        value={customHost}
                        onChange={(e) => setCustomHost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Portal name</Label>
                      <Input
                        placeholder="e.g. Example Council Grants"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Username / Email</Label>
                  <Input
                    placeholder="your-email@example.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    Save credential
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowAddForm(false); resetForm(); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="mr-1.5 h-3 w-3" />
                Add portal credential
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
