import { useEffect, useState } from "react";
import { Activity, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { HealthResponse } from "@smart-home/shared";

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health");
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data: HealthResponse = await res.json();
      setHealth(data);
    } catch (err) {
      console.error("Error fetching health status:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-slate-50">
      <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-500 animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight">Smart Home System</h1>
          </div>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span className="text-sm text-slate-400">Backend Status</span>
            {loading ? (
              <span className="text-sm text-slate-400 flex items-center gap-1">
                <RefreshCw className="w-4 h-4 animate-spin" /> Checking...
              </span>
            ) : error ? (
              <span className="text-sm text-red-500 flex items-center gap-1 font-medium">
                <AlertCircle className="w-4 h-4" /> Offline
              </span>
            ) : health?.status === "ok" ? (
              <span className="text-sm text-emerald-500 flex items-center gap-1 font-medium">
                <CheckCircle className="w-4 h-4" /> Online
              </span>
            ) : (
              <span className="text-sm text-amber-500 flex items-center gap-1 font-medium">
                <AlertCircle className="w-4 h-4" /> Unknown
              </span>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-sm">
              <p className="font-semibold mb-1">Connection Error</p>
              <p className="font-mono text-xs">{error}</p>
            </div>
          )}

          {health && !loading && !error && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Status Code</span>
                <span className="font-mono text-emerald-400">{health.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Timestamp</span>
                <span className="font-mono text-slate-300">
                  {new Date(health.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          Phase 1: Monorepo Architecture & Health Check Verified
        </div>
      </div>
    </div>
  );
}

export default App;
