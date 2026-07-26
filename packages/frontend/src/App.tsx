"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Activity, AlertCircle, CheckCircle, ChevronDown, ChevronUp, RefreshCw, Zap } from "lucide-react";
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
  // Use the persistent state hook for global app state management
  const [appState, updateAppState] = usePersistentState<AppState>(
    STORAGE_KEY,
    initialAppState,
  );
  const [isFetching, setIsFetching] = useState(false);


  // --- WebSocket Connection Logic ---
  useEffect(() => {
    console.log("Attempting to connect to WebSocket...");
    const ws = new WebSocket("ws://localhost:3001");

    ws.onopen = () => {
      console.log("WebSocket connected successfully.");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.warn("WebSocket disconnected. Attempting to reconnect in 5 seconds...");
      setTimeout(() => {
        // Simple reconnection attempt
        const newWs = new WebSocket("ws://localhost:3001");
        newWs.onopen = () => console.log("WebSocket reconnected.");
        newWs.onerror = (error) => console.error("WebSocket error:", error);
        newWs.onclose = () => {};
      }, 5000);
    };

    ws.onmessage = (event) => {
      const message = event.data;
      try {
        const data = JSON.parse(message);
        if (data.type === 'DEVICE_UPDATE' && data.data) {
          // FIX: Using the correct property names from DeviceState interface
          const updatedDevice: DeviceState = data.data as DeviceState; 
          console.log(`[WS Update] Received real-time update for ${updatedDevice.device_id}`);

          // Update the state with the new, confirmed device status
          updateAppState({
            devices: {
              ...appState.devices,
              [updatedDevice.device_id]: updatedDevice,
            },
          });
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    // Cleanup function to close the connection when component unmounts
    return () => {
      ws.close();
    };
  }, [updateAppState, appState.devices]);


  // --- Data Fetching Logic (Initial Load & Health Check) ---
  const fetchSystemStatus = useCallback(async () => {
    setIsFetching(true);
    updateAppState({ isLoading: true, error: null });

    try {
      // 1. Fetch Health Status (always needed)
      const healthRes = await fetch("/api/health");
      if (!healthRes.ok) throw new Error(`HTTP error! status: ${healthRes.status}`);
      const healthData: HealthResponse = await healthRes.json();

      // 2. Fetch Device List (Initial state load)
      const deviceRes = await fetch("/api/devices");
      if (!deviceRes.ok) throw new Error(`HTTP error! status: ${deviceRes.status}`);
      const discoveredDevices: Record<string, DeviceState> = await deviceRes.json();

      // Initialize the state with all devices found in the database
      updateAppState({
        healthStatus: healthData,
        devices: discoveredDevices, 
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
  }, [updateAppState]);

  // We only run this on mount now. Real-time updates are handled by the WebSocket hook above.
  useEffect(() => {
    fetchSystemStatus();
  }, [fetchSystemStatus]);


  const handleDeviceToggle = async (deviceId: string, currentIsOn: boolean) => {
    if (isFetching) return;

    // Optimistic update (The UI updates instantly before the backend confirms)
    updateAppState({
      devices: {
        ...appState.devices,
        [deviceId]: {
          ...appState.devices[deviceId],
          is_on: !currentIsOn, // FIX: Use snake_case property name
          last_updated: Date.now(), // FIX: Use snake_case property name
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

      // The backend will now handle the state update and WebSocket broadcast, 
      // so we just confirm success here.
      if (data.success && typeof data.newState === "boolean") {
        console.log("Toggle successful. Waiting for WS confirmation...");
      } else {
        throw new Error("Backend did not confirm state change");
      }
    } catch (error) {
      console.error("Device toggle failed:", error);
      // Revert optimistic update on failure
      updateAppState({
        devices: {
          ...appState.devices,
          [deviceId]: { ...appState.devices[deviceId], is_on: currentIsOn }, // FIX: Use snake_case property name
        },
      });
      window.alert(`Failed to control device ${deviceId}. Check the console for details.`);
    }
  };

  const DeviceCard = ({ device }: { device: DeviceState }) => {
    // Determine toggle style based on the state key (is_on)
    const isLightOn = device.state_key === 'is_on' ? (device.value as boolean) : true; 
    const toggleStyle = isLightOn ? "bg-emerald-600" : "bg-slate-700";
    const translateClass = isLightOn ? "translate-x-6" : "translate-x-1";

    return (
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4 transition duration-200 hover:border-indigo-700/50">
        <div className="flex flex-col">
          {/* FIX: Use standardized property names */}
          <h3 className="text-lg font-semibold">{device.name}</h3 > 
          <p className="text-sm capitalize text-slate-400">{device.type}</p>
        </div >
        {/* Only allow toggling if the device is a light and we are controlling its power state */}
        {(device.state_key === 'is_on') ? (
            <button
                onClick={() => handleDeviceToggle(device.device_id, device.value as boolean)}
                disabled={isFetching}
                aria-label={`Toggle ${device.name}`}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${toggleStyle}`}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${translateClass}`}
                />
            </button>
        ) : (
             // Placeholder for other controls (e.g., a slider for brightness)
             <div className="w-12 h-6 bg-slate-800 rounded-full flex items-center justify-center text-xs text-gray-500">
                Control
            </div>
        )}
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
          className={`grid gap-6 p-5 transition-all duration-300 ${
            isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
          } overflow-hidden`}
        >
          {devices.map((d) => (
            <DeviceCard key={d.device_id + d.state_key} device={d} />
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
          {Object.keys(appState.devices).length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-center text-sm text-slate-500">
              No devices discovered yet. Check the backend logs for connection errors.
            </p>
          ) : (
            <div className="space-y-6">
              {/* Grouping logic remains the same */}
              {Object.entries(useMemo(() => {
                return Object.values(appState.devices).reduce<Record<string, DeviceState[]>>(
                  (acc, device) => {
                    if (!acc[device.room]) acc[device.room] = [];
                    acc[device.room].push(device);
                    return acc;
                  },
                  {},
                );
              }, [appState.devices])).map(([room, devices]) => (
                <RoomContainer key={room} roomName={room} devices={devices} />
              ))}
            </div >
          )}
        </div>

        <div className="mt-8 text-center text-xs text-slate-500">
          Real-time state synchronization via WebSockets is now active.
        </div>
      </div>
    </div>
  );
}

export default App;