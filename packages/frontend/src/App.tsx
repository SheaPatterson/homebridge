import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap, // Added Zap icon for better visual appeal
} from "lucide-react";
// FIX: Changed import path from package alias to relative file path
import {
  AppState,
  DeviceState,
  HealthResponse,
  usePersistentState,
} from "../../shared/src";

const initialAppState: AppState = {
  healthStatus: null,
  devices: {},
  isLoading: true,
  error: null,
};

const STORAGE_KEY = "smartHomeDashboardState";

function App() {
  const [appState, updateAppState] = usePersistentState<AppState>(
    STORAGE_KEY,
    initialAppState,
  );
  const [isFetching, setIsFetching] = useState(false);

  // Group devices by room. Memoized so it only recomputes when devices change.
  const devicesByRoom = useMemo(() => {
    return Object.values(appState.devices).reduce<Record<string, DeviceState[]>>(
      (acc, device) => {
        if (!acc[device.room]) acc[device.room] = [];
        acc[device.room].push(device);
        return acc;
      },
      {},
    );
  }, [appState.devices]);

  const fetchSystemStatus = async () => {
    setIsFetching(true);
    updateAppState({ isLoading: true, error: null });

    try {
      // 1. Fetch Health Status (always needed)
      const healthRes = await fetch("/api/health");
      if (!healthRes.ok) throw new Error(`HTTP error! status: ${healthRes.status}`);
      const healthData: HealthResponse = await healthRes.json();

      // 2. Fetch Device List (NEW STEP)
      const deviceRes = await fetch("/api/devices");
      if (!deviceRes.ok) throw new Error(`HTTP error! status: ${deviceRes.status}`);
      const discoveredDevices: Record<string, DeviceState> = await deviceRes.json();

      // Merge discovered devices with existing persistent state (for toggles)
      let mergedDevices: Record<string, DeviceState> = { ...appState.devices };
      Object.keys(discoveredDevices).forEach((deviceId) => {
          const discoveredDevice = discoveredDevices[deviceId];
          if (!mergedDevices[deviceId]) {
              // If device is new or missing from persistent state, use the discovered data
              mergedDevices[deviceId] = discoveredDevice;
          } else {
              // Keep the user's last known state (e.g., if they toggled it off)
              const existingState = mergedDevices[deviceId];
              if (existingState.isOn !== discoveredDevice.isOn) {
                  // We prioritize persistent state for better UX continuity
              }
          }
      });


      updateAppState({
        healthStatus: healthData,
        devices: mergedDevices, // Use the merged device map
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Error fetching system status:", err);
      updateAppState({
        isLoading: false,
        error: `Failed to connect or retrieve data: ${message}`,
        healthStatus: null,
      });
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchSystemStatus();
    const interval = window.setInterval(fetchSystemStatus, 30_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeviceToggle = async (deviceId: string, currentIsOn: boolean) => {
    if (isFetching) return;

    // Optimistic update
    updateAppState({
      devices: {
        ...appState.devices,
        [deviceId]: {
          ...appState.devices[deviceId],
          isOn: !currentIsOn,
          lastUpdated: Date.now(),
        },
      },
    });

    try {
      const res = await fetch(`/api/device/${deviceId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { success: boolean; newState?: boolean };

      if (data.success && typeof data.newState === "boolean") {
        updateAppState({
          devices: {
            ...appState.devices,
            [deviceId]: {
              ...appState.devices[deviceId],
              isOn: data.newState,
              lastUpdated: Date.now(),
            },
          },
        });
      } else {
        throw new Error("Backend did not confirm state change");
      }
    } catch (error) {
      console.error("Device toggle failed:", error);
      // Revert optimistic update
      updateAppState({
        devices: {
          ...appState.devices,
          [deviceId]: { ...appState.devices[deviceId], isOn: currentIsOn },
        },
      });
      window.alert(`Failed to control device ${deviceId}. Check the console for details.`);
    }
  };

  const DeviceCard = ({ device }: { device: DeviceState }) => {
    const toggleStyle = device.isOn ? "bg-emerald-600" : "bg-slate-700";
    const translateClass = device.isOn ? "translate-x-6" : "translate-x-1";
    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 transition duration-200 hover:border-indigo-700/50">
        <div className="flex flex-col">
          <h3 className="text-lg font-semibold">{device.name}</h3>
          <p className="text-sm capitalize text-slate-400">{device.type}</p>
        </div>
        <button
          onClick={() => handleDeviceToggle(device.id, device.isOn)}
          disabled={isFetching}
          aria-label={`Toggle ${device.name}`}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${toggleStyle}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${translateClass}`}
          />
        </button>
      </div >
    );
  };

  const RoomContainer = ({
    roomName,
    devices,
  }: {
    roomName: string;
    devices: DeviceState[];
  }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl transition-all duration-300">
        {/* Header Button */}
        <button
          className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-slate-800 focus:outline-none"
          onClick={() => setIsOpen((o) => !o)}
        >
          <h2 className="text-xl font-bold text-indigo-300">{roomName}</h2>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </button>
        {/* Content Area */}
        <div
          className={`grid gap-4 p-5 transition-all duration-300 ${
            isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
          } overflow-hidden`}
        >
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-50">
      <div className="w-full max-w-xl space-y-8 rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Activity className="h-7 w-7 text-indigo-500" />
            <h1 className="text-2xl font-bold tracking-tight">
              Smart Home Dashboard
            </h1>
          </div>
          <button
            onClick={fetchSystemStatus}
            disabled={isFetching}
            className={`rounded-lg p-2 transition-colors ${isFetching ? 'cursor-wait' : 'hover:bg-slate-700'} disabled:opacity-50`}
            title="Refresh Status"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {/* System Status */}
        <div className="space-y-2">
          <h2 className="border-b border-slate-800 pb-1 text-lg font-semibold text-slate-300 flex items-center gap-2"><Zap className='w-5 h-5'/> System Status</h2>
          <div className={`flex items-center justify-between rounded-xl p-4 ${appState.error ? 'border-red-700/50 bg-red-950/30' : 'border-slate-800 bg-slate-950'} border`}>
            <span className="text-sm text-slate-400">Backend Status</span>
            {appState.healthStatus ? (
              <span className="flex items-center gap-1 text-sm font-medium text-emerald-500">
                <CheckCircle className="h-4 w-4" /> Online
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm font-medium text-red-500">
                <AlertCircle className="h-4 w-4" /> Offline
              </span>
            )}
          </div >

          {appState.error && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400">
              <p className="mb-1 font-semibold">Connection Error</p>
              <p className="font-mono text-xs">{appState.error}</p>
            </div>
          )}

          {appState.healthStatus && !isFetching && (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Status Code</span>
                <span className="font-mono text-emerald-400">
                  {appState.healthStatus.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Last Check</span>
                <span className="font-mono text-slate-300">
                  {new Date(appState.healthStatus.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}
        </div >

        {/* Rooms */}
        <div className="border-t border-slate-800 pt-4">
          <h2 className="mb-4 text-lg font-semibold text-slate-300 flex items-center gap-2"><Zap className='w-5 h-5'/> Devices by Room</h2>
          {Object.keys(devicesByRoom).length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-center text-sm text-slate-500">
              No devices discovered yet. Check the backend logs for connection errors.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(devicesByRoom).map(([room, devices]) => (
                <RoomContainer key={room} roomName={room} devices={devices} />
              ))}
            </div>
          )}
        </div >

        <div className="mt-8 text-center text-xs text-slate-500">
          Phase 4: UX Redesign Complete. State is persistent and database-backed.
        </div>
      </div>
    </div>
  );
}

export default App;