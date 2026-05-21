import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type Metrics = {
  timestamp: string;
  posts: {
    published_24h: number;
    published_7d: number;
    scheduled_future: number;
    failed_24h: number;
  };
  users: {
    new_24h: number;
    with_industries: number;
    active_linkedin_tokens: number;
    expiring_linkedin_tokens_7d: number;
  };
  content: {
    articles_24h: number;
    articles_total: number;
    sources_processed: number;
  };
};

type Check = { name: string; ok: boolean; ms: number; detail?: string };
type Synthetic = { ok: boolean; checks: Check[]; failed_count: number };

export default function AdminHealth() {
  const { isSuperAdmin, isLoading: roleLoading } = useImpersonation();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [synthetic, setSynthetic] = useState<Synthetic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [roleLoading, isSuperAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, s] = await Promise.all([
        supabase.functions.invoke("health-metrics"),
        supabase.functions.invoke("synthetic-check"),
      ]);
      if (m.error) throw new Error(m.error.message);
      setMetrics(m.data as Metrics);
      // synthetic-check returns 503 on failure but data is still useful
      setSynthetic((s.data as Synthetic) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) load();
     
  }, [isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-sm text-muted-foreground">
            {metrics?.timestamp ? `Updated ${new Date(metrics.timestamp).toLocaleTimeString()}` : "—"}
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" /> {error}
          </CardContent>
        </Card>
      )}

      {/* Synthetic checks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Synthetic Checks
            {synthetic && (
              <Badge variant={synthetic.ok ? "default" : "destructive"}>
                {synthetic.ok ? "All passing" : `${synthetic.failed_count} failing`}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {synthetic?.checks.map((c) => (
            <div key={c.name} className="flex items-center justify-between border-b py-2 last:border-0">
              <div className="flex items-center gap-2">
                {c.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-mono text-sm">{c.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {c.detail} · {c.ms}ms
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Posts */}
      <Card>
        <CardHeader><CardTitle>Posts (last 24h / 7d)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Published 24h" value={metrics?.posts.published_24h} />
          <Metric label="Published 7d" value={metrics?.posts.published_7d} />
          <Metric label="Scheduled" value={metrics?.posts.scheduled_future} />
          <Metric label="Failed 24h" value={metrics?.posts.failed_24h} alert={(metrics?.posts.failed_24h ?? 0) > 0} />
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="New 24h" value={metrics?.users.new_24h} />
          <Metric label="With industries" value={metrics?.users.with_industries} />
          <Metric label="LinkedIn connected" value={metrics?.users.active_linkedin_tokens} />
          <Metric
            label="Token expiring <7d"
            value={metrics?.users.expiring_linkedin_tokens_7d}
            alert={(metrics?.users.expiring_linkedin_tokens_7d ?? 0) > 0}
          />
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader><CardTitle>Content</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Metric label="Articles 24h" value={metrics?.content.articles_24h} />
          <Metric label="Articles total" value={metrics?.content.articles_total} />
          <Metric label="Sources processed" value={metrics?.content.sources_processed} />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, alert }: { label: string; value?: number; alert?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${alert ? "text-destructive" : ""}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}
