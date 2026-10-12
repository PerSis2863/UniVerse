'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import {
  Key,
  Webhook,
  Code2,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Shield,
  AlertCircle,
  ExternalLink,
  Lock,
  Radio,
} from 'lucide-react';
import { VALID_API_SCOPES, type ApiScope } from '@/server/public-api';
import { VALID_WEBHOOK_EVENTS, type WebhookEvent } from '@/server/webhooks';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiScope[];
  rateLimit: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface WebhookItem {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  isActive: boolean;
  description: string | null;
  createdAt: string;
  _count: { deliveries: number };
}

interface DeliveryItem {
  id: string;
  event: string;
  payload: string;
  statusCode: number | null;
  status: 'SUCCESS' | 'FAILED';
  error: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export function DeveloperApiPanel() {
  const [tab, setTab] = useState<'keys' | 'webhooks' | 'docs'>('keys');

  // Keys state
  const { data: keys, mutate: mutateKeys, isLoading: loadingKeys } = useSWR<ApiKeyItem[]>(
    '/api/admin/api-keys',
    authedJson,
  );
  const [creatingKey, setCreatingKey] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>(['courses.read', 'students.read']);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(90);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{ name: string; secretKey: string } | null>(null);

  // Webhooks state
  const { data: webhooks, mutate: mutateWebhooks, isLoading: loadingWebhooks } = useSWR<WebhookItem[]>(
    '/api/admin/webhooks',
    authedJson,
  );
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookDesc, setWebhookDesc] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([
    'assignment.submitted',
    'grade.posted',
  ]);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Deliveries inspection
  const [inspectingWebhookId, setInspectingWebhookId] = useState<string | null>(null);
  const { data: deliveries, isLoading: loadingDeliveries, mutate: mutateDeliveries } = useSWR<DeliveryItem[]>(
    inspectingWebhookId ? `/api/admin/webhooks/${inspectingWebhookId}/deliveries` : null,
    authedJson,
  );

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedText(null), 2500);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      toast.error('Key name is required');
      return;
    }
    try {
      const res = await authedJson<{ id: string; name: string; secretKey: string }>('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName,
          scopes: selectedScopes,
          expiresInDays: expiresInDays || null,
        }),
      });
      setNewlyCreatedKey({ name: res.name, secretKey: res.secretKey });
      setKeyName('');
      setCreatingKey(false);
      mutateKeys();
      toast.success('API Key generated successfully');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create API key');
    }
  };

  const handleRevokeKey = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke API key "${name}"? Programmatic requests using this key will immediately fail.`)) {
      return;
    }
    try {
      await authedJson(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
      toast.success('API Key revoked');
      mutateKeys();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim() || !webhookUrl.startsWith('https://')) {
      toast.error('Webhook URL must begin with https://');
      return;
    }
    try {
      await authedJson('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          description: webhookDesc || null,
          events: selectedEvents,
        }),
      });
      setCreatingWebhook(false);
      setWebhookUrl('');
      setWebhookDesc('');
      mutateWebhooks();
      toast.success('Webhook endpoint configured');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create webhook');
    }
  };

  const handleToggleWebhook = async (item: WebhookItem) => {
    try {
      await authedJson(`/api/admin/webhooks/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      mutateWebhooks();
      toast.success(item.isActive ? 'Webhook paused' : 'Webhook activated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update webhook');
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook subscription?')) return;
    try {
      await authedJson(`/api/admin/webhooks/${id}`, { method: 'DELETE' });
      toast.success('Webhook deleted');
      mutateWebhooks();
      if (inspectingWebhookId === id) setInspectingWebhookId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  };

  const handleTestWebhook = async (event: WebhookEvent) => {
    try {
      const res = await authedJson<{ dispatched: number }>('/api/admin/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });
      toast.success(`Dispatched test event to ${res.dispatched} active endpoint(s)`);
      if (inspectingWebhookId) mutateDeliveries();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to dispatch test event');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Code2 className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                UniVerse Developer Platform
              </h2>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                v1 REST API
              </span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Build custom integrations, synchronize student rosters, and receive tamper-evident HMAC webhook notifications.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/v1/openapi"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
              OpenAPI Specification
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 mt-6 gap-6 text-sm font-medium">
          <button
            onClick={() => setTab('keys')}
            className={`pb-3 inline-flex items-center gap-2 transition ${
              tab === 'keys'
                ? 'border-b-2 border-violet-600 text-violet-600 dark:text-violet-400'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Key className="w-4 h-4" />
            API Keys
            {keys && <span className="px-1.5 py-0.2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs">{keys.length}</span>}
          </button>

          <button
            onClick={() => setTab('webhooks')}
            className={`pb-3 inline-flex items-center gap-2 transition ${
              tab === 'webhooks'
                ? 'border-b-2 border-violet-600 text-violet-600 dark:text-violet-400'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Webhook className="w-4 h-4" />
            Webhooks & Deliveries
            {webhooks && <span className="px-1.5 py-0.2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs">{webhooks.length}</span>}
          </button>

          <button
            onClick={() => setTab('docs')}
            className={`pb-3 inline-flex items-center gap-2 transition ${
              tab === 'docs'
                ? 'border-b-2 border-violet-600 text-violet-600 dark:text-violet-400'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            Interactive Guide
          </button>
        </div>
      </div>

      {/* NEWLY CREATED KEY MODAL CALLOUT */}
      {newlyCreatedKey && (
        <div className="p-5 rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-950/30 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Save your secret key now!
          </div>
          <p className="text-xs text-amber-900/80 dark:text-amber-300/80">
            This secret token for <strong className="font-semibold">{newlyCreatedKey.name}</strong> will never be shown again. Please copy and store it securely.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-800/50 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto select-all">
              {newlyCreatedKey.secretKey}
            </code>
            <button
              onClick={() => copyToClipboard(newlyCreatedKey.secretKey, 'new-key')}
              className="px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition shrink-0"
            >
              {copiedText === 'new-key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              Copy Key
            </button>
            <button
              onClick={() => setNewlyCreatedKey(null)}
              className="px-3 py-2.5 rounded-xl border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-100/50 dark:hover:bg-amber-900/40 transition shrink-0"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: API KEYS */}
      {tab === 'keys' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Active API Keys
            </h3>
            <button
              onClick={() => setCreatingKey(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate New Key
            </button>
          </div>

          {creatingKey && (
            <form onSubmit={handleCreateKey} className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Generate Scoped API Key</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Key Name / Client System
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Canvas LMS Sync, Mobile App Service"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Expiration Period
                  </label>
                  <select
                    value={expiresInDays ?? ''}
                    onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  >
                    <option value="30">30 Days</option>
                    <option value="90">90 Days (Recommended)</option>
                    <option value="365">1 Year</option>
                    <option value="">Never Expires</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Permissions & Scopes
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {VALID_API_SCOPES.map((scope) => {
                    const checked = selectedScopes.includes(scope);
                    return (
                      <label
                        key={scope}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          checked
                            ? 'border-violet-500/40 bg-violet-50/50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedScopes([...selectedScopes, scope]);
                            } else {
                              setSelectedScopes(selectedScopes.filter((s) => s !== scope));
                            }
                          }}
                          className="rounded text-violet-600 focus:ring-violet-500"
                        />
                        <span className="font-mono text-[11px]">{scope}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreatingKey(false)}
                  className="px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition"
                >
                  Generate Key
                </button>
              </div>
            </form>
          )}

          {loadingKeys ? (
            <div className="p-8 text-center text-xs text-zinc-500">Loading API keys...</div>
          ) : !keys || keys.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-2">
              <Key className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No API keys created yet</p>
              <p className="text-xs text-zinc-500">Create an API key to access student rosters, grades, and attendance programmatically.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              {keys.map((k) => (
                <div key={k.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{k.name}</span>
                      <code className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono">
                        {k.keyPrefix}...
                      </code>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {k.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 font-mono text-[10px]"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-zinc-500">
                      <span>Rate limit: {k.rateLimit} req/min</span>
                      <span>Created: {new Date(k.createdAt).toLocaleDateString()}</span>
                      {k.expiresAt && <span>Expires: {new Date(k.expiresAt).toLocaleDateString()}</span>}
                      {k.lastUsedAt ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Last used: {new Date(k.lastUsedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span>Never used</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRevokeKey(k.id, k.name)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WEBHOOKS */}
      {tab === 'webhooks' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Configured Webhook Endpoints
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTestWebhook('assignment.submitted')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
              >
                <Play className="w-3.5 h-3.5 text-zinc-500" />
                Dispatch Test Event
              </button>
              <button
                onClick={() => setCreatingWebhook(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Endpoint
              </button>
            </div>
          </div>

          {creatingWebhook && (
            <form onSubmit={handleCreateWebhook} className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Subscribe Webhook Destination</h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Destination URL (HTTPS)
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.youruniversity.edu/webhooks/universe"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ERP integration or external LMS alert service"
                    value={webhookDesc}
                    onChange={(e) => setWebhookDesc(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Subscribed Events
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {VALID_WEBHOOK_EVENTS.map((event) => {
                      const checked = selectedEvents.includes(event);
                      return (
                        <label
                          key={event}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                            checked
                              ? 'border-violet-500/40 bg-violet-50/50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEvents([...selectedEvents, event]);
                              } else {
                                setSelectedEvents(selectedEvents.filter((ev) => ev !== event));
                              }
                            }}
                            className="rounded text-violet-600 focus:ring-violet-500"
                          />
                          <span className="font-mono text-[11px]">{event}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreatingWebhook(false)}
                  className="px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition"
                >
                  Create Endpoint
                </button>
              </div>
            </form>
          )}

          {loadingWebhooks ? (
            <div className="p-8 text-center text-xs text-zinc-500">Loading webhooks...</div>
          ) : !webhooks || webhooks.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-2">
              <Webhook className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No webhooks configured</p>
              <p className="text-xs text-zinc-500">Add an HTTPS endpoint to receive immediate event dispatches whenever grades, attendance, or assignments are updated.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              {webhooks.map((wh) => (
                <div key={wh.id} className="p-4 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${wh.isActive ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                        <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">{wh.url}</span>
                        {wh.description && (
                          <span className="text-xs text-zinc-500">({wh.description})</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {wh.events.map((ev) => (
                          <span key={ev} className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[10px]">
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleWebhook(wh)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                          wh.isActive
                            ? 'border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {wh.isActive ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setInspectingWebhookId(inspectingWebhookId === wh.id ? null : wh.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-800 transition ${
                          inspectingWebhookId === wh.id ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        Deliveries ({wh._count.deliveries})
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(wh.id)}
                        className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Secret HMAC Key */}
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span className="text-zinc-500 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Signing Secret:
                    </span>
                    <code className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                      {revealedSecrets[wh.id] ? wh.secret : `${wh.secret.slice(0, 10)}••••••••••••••••••••`}
                    </code>
                    <button
                      onClick={() => setRevealedSecrets({ ...revealedSecrets, [wh.id]: !revealedSecrets[wh.id] })}
                      className="text-violet-600 dark:text-violet-400 hover:underline text-[11px]"
                    >
                      {revealedSecrets[wh.id] ? 'Hide' : 'Reveal'}
                    </button>
                    <button
                      onClick={() => copyToClipboard(wh.secret, wh.id)}
                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
                    >
                      {copiedText === wh.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Live Deliveries Drawer */}
                  {inspectingWebhookId === wh.id && (
                    <div className="mt-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-violet-500" />
                          Recent Delivery Attempts
                        </span>
                        <button
                          onClick={() => mutateDeliveries()}
                          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> Refresh
                        </button>
                      </div>

                      {loadingDeliveries ? (
                        <div className="text-xs text-zinc-500 py-3">Loading deliveries...</div>
                      ) : !deliveries || deliveries.length === 0 ? (
                        <div className="text-xs text-zinc-500 py-3">No delivery events recorded yet. Trigger a test event or make changes to generate dispatches.</div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {deliveries.map((del) => (
                            <div key={del.id} className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs flex items-center justify-between gap-3">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    del.status === 'SUCCESS'
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                  }`}>
                                    {del.statusCode ? `HTTP ${del.statusCode}` : del.status}
                                  </span>
                                  <span className="font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{del.event}</span>
                                </div>
                                <span className="text-[10px] text-zinc-400">{new Date(del.createdAt).toLocaleString()}</span>
                              </div>

                              {del.error && (
                                <span className="text-[11px] text-rose-500 font-mono truncate max-w-xs">{del.error}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INTERACTIVE GUIDE */}
      {tab === 'docs' && (
        <div className="space-y-6">
          {/* Quickstart Card */}
          <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-500" />
              Programmatic Authentication
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              UniVerse V1 endpoints authenticate using Bearer tokens in the HTTP Authorization header.
            </p>
            <div className="p-3 rounded-xl bg-zinc-900 text-zinc-100 font-mono text-xs overflow-x-auto">
              curl -X GET https://universeimpact.com/api/v1/courses \<br />
              &nbsp;&nbsp;-H &quot;Authorization: Bearer uv_live_your_api_key_here&quot;
            </div>
          </div>

          {/* Webhook Signature Verification Guide */}
          <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-500" />
              HMAC SHA-256 Webhook Verification
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Each webhook dispatch contains a <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">UniVerse-Signature</code> header in format <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">t=timestamp,v1=signature</code>. Verify it to prevent spoofing:
            </p>
            <div className="p-3 rounded-xl bg-zinc-900 text-zinc-100 font-mono text-xs overflow-x-auto space-y-1">
              <div>{"// Node.js Express / Next.js verification"}</div>
              <div>import crypto from &apos;crypto&apos;;</div>
              <br />
              <div>const hmac = crypto.createHmac(&apos;sha256&apos;, WEBHOOK_SECRET);</div>
              <div>{"hmac.update(`${timestamp}.${rawBody}`);"}</div>
              <div>const expected = hmac.digest(&apos;hex&apos;);</div>
              <div>const isValid = crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));</div>
            </div>
          </div>

          {/* Core Endpoints List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Available V1 REST Endpoints
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { method: 'GET', path: '/api/v1/courses', desc: 'List active curriculum courses with department and teacher metadata', scope: 'courses.read' },
                { method: 'POST', path: '/api/v1/courses', desc: 'Create course records and allocate initial credits', scope: 'courses.write' },
                { method: 'GET', path: '/api/v1/students', desc: 'Query enrolled students with attendance rates and grades', scope: 'students.read' },
                { method: 'GET', path: '/api/v1/grades', desc: 'Retrieve recent student submissions and academic scores', scope: 'grades.read' },
                { method: 'POST', path: '/api/v1/grades', desc: 'Submit or adjust student grades with audit attribution', scope: 'grades.write' },
                { method: 'GET', path: '/api/v1/attendance', desc: 'Retrieve attendance logs filtered by course and date', scope: 'attendance.read' },
                { method: 'POST', path: '/api/v1/attendance', desc: 'Batch record class attendance statuses (PRESENT, ABSENT, LATE)', scope: 'attendance.write' },
                { method: 'GET', path: '/api/v1/openapi', desc: 'Machine-readable OpenAPI 3.1 specification for codegen', scope: 'Public' },
              ].map((ep) => (
                <div key={ep.method + ep.path} className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ep.method === 'GET' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {ep.method}
                      </span>
                      <code className="text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-200">{ep.path}</code>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">{ep.scope}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{ep.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
