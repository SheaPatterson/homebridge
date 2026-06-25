import { useEffect, useState } from "react";
import { Activity, CheckCircle, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { HealthResponse, DeviceState, AppState, usePersistentState } from "@smart-home/shared";

// Initial state definition for the persistent hook
const initialAppState: AppState = {
    healthStatus: null,
    devices: {}, // Empty device map initially
    isLoading: true,
    error: null,
};

function App() {
  // Use the custom hook to manage and persist the entire application state
  const [appState, updateAppState] = usePersistentState<AppState>("smartHomeDashboardState", initialAppState);
  
  // State for managing local UI loading/fetching status (separate from appState.isLoading)
  const [isFetching, setIsFetching] = useState(false);

  /**
   * Fetches health status and simulates device discovery to update the persistent state.
   */
  const fetchSystemStatus = async () => {
    setIsFetching(true);
    updateAppState({ isLoading: true, error: null }); // Set loading state globally

    try {
      // 1. Fetch Backend Health Status (Existing functionality)
      const res = await fetch("/api/health");
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const healthData: HealthResponse = await res.json();

      // 2. Simulate Device Discovery (Placeholder for future logic)
      // In a real app, this would call an API endpoint to get all devices.
      const simulatedDevices: Record<string, DeviceState> = {
        'light-1': { id: 'light-1', name: 'Living Room Light', type: 'light', isOn: true, brightness: 80, room: 'Living Room', lastUpdated: Date.now() },
        'thermo-2': { id: 'thermo-2', name: 'Main Thermostat', type: 'thermostat', isOn: false, temperature: 21.5, room: 'Hallway', lastUpdated: Date.now() },
        'light-3': { id: 'light-3', name: 'Kitchen Spot Light', type: 'light', isOn: false, brightness: undefined, room: 'Kitchen', lastUpdated: Date.now() },
      };

      // Update the persistent state with all gathered data
      updateAppState({
        healthStatus: healthData,
        devices: simulatedDevices,
        isLoading: false,
        error: null,
      });

    } catch (err) {
      console.error("Error fetching system status:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to connect to backend";
      updateAppState({ 
          isLoading: false, 
          error: errorMessage, 
          healthStatus: null // Clear health status on error
      });
    } finally {
      setIsFetching(false);
    }
  };

  // Initial load and periodic refresh setup
  useEffect(() => {
    fetchSystemStatus();
    // Set up a polling mechanism to keep the state fresh (e.g., every 30 seconds)
    const intervalId = setInterval(fetchSystemStatus, 30000);
    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  /**
   * Handles toggling a device's state by calling the backend API.
   */
  const handleDeviceToggle = async (deviceId: string, currentIsOn: boolean) => {
    if (isFetching) return;

    // Optimistic update: immediately flip the UI state
    updateAppState({
        devices: {
            ...appState.devices,
            [deviceId]: { ...appState.devices[deviceId], isOn: !currentIsOn }
        }
    });

    try {
      const res = await fetch(`/api/device/${deviceId}/toggle`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({ toggle: !currentIsOn })
      });

      if (!res.ok) {
        throw new Error(`Failed to update device state: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.success && data.newState !== undefined) {
          // Final confirmation of the state change from the backend
          updateAppState({
              devices: {
                  ...appState.devices,
                  [deviceId]: { ...appState.devices[deviceId], isOn: data.newState }
              }
          });
      } else {
          throw new Error("Backend reported failure to update state.");
      }

    } catch (error) {
      console.error("Device toggle failed:", error);
      // Revert the optimistic update on failure
      updateAppState({
        devices: {
            ...appState.devices,
            [deviceId]: { ...appState.devices[deviceId], isOn: currentIsOn } // Revert to original state
        }
    });
      alert("Failed to control device. Please check the console for details.");
    }
  };

  // Helper component for displaying device controls
  const DeviceCard: React.FC<{ device: DeviceState }> = ({ device }) => {
    const toggleStyle = device.isOn ? "bg-emerald-600" : "bg-slate-700";
    return (
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-lg">{device.name}</h3 >
          <p className="text-sm text-slate-400">{device.type}</p>
        </div>
        {/* Simple toggle switch placeholder */}
        <button 
            onClick={() => handleDeviceToggle(device.id, device.isOn)}
            disabled={isFetching}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${toggleStyle} focus:outline-none disabled:opacity-50`}
        >
            <span className="inline-block h-4 w-4 transform transition-transform bg-white rounded-full translate-x-full shadow"></span>
        </button>
      </div>
    );
  };

  // Component to group devices by room
  const RoomContainer: React.FC<{ roomName: string, devices: DeviceState[] }> = ({ roomName, devices }) => {
    const [isOpen, setIsOpen] = useState(true);

    return (
      <div className="border border-slate-700 rounded-xl bg-slate-900 shadow-lg overflow-hidden">
        {/* Room Header */}
        <button 
            className="w-full flex justify-between items-center p-4 text-left hover:bg-slate-800 transition-colors"
            onClick={() => setIsOpen(!isOpen)}
        >
          <h2 className="text-xl font-bold text-indigo-300">{roomName}</h2>
          {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>

        {/* Device List */}
        <div className={`transition-all duration-300 ${isOpen ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
            <div className="p-4 grid grid-cols-1 gap-4">
                {devices.map((device) => (
                    <DeviceCard key={device.id} device={device} />
                ))}
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-slate-50">
      <div className="w-full max-w-xl p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-8">
        
        {/* Header and Refresh Button */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Activity className="w-7 h-7 text-indigo-500" />
            <h1 className="text-2xl font-bold tracking-tight">Smart Home Dashboard</h1>
          </div>
          <button
            onClick={fetchSystemStatus}
            disabled={isFetching}
            className={`p-2 rounded-lg transition-colors ${isFetching ? 'bg-slate-800 cursor-wait' : 'hover:bg-slate-700'} disabled:opacity-50`}
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* System Health Status */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-300 border-b pb-1 mb-4">System Status</h2>
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span className="text-sm text-slate-400">Backend Status</span>
            {appState.healthStatus ? (
              <span className={`text-sm flex items-center gap-1 font-medium ${appState.healthStatus.status === "ok" ? 'text-emerald-500' : 'text-red-500'}`}>
                <CheckCircle className="w-4 h-4" /> Online
              </span>
            ) : (
              <span className="text-sm text-red-500 flex items-center gap-1 font-medium">
                <AlertCircle className="w-4 h-4" /> Offline
              </span>
            )}
          </div >

          {appState.error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-sm">
              <p className="font-semibold mb-1">Connection Error</p>
              <p className="font-mono text-xs">{appState.error}</p>
            </div>
          )}

          {/* Displaying detailed health info if available */}
          {appState.healthStatus && !isFetching && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Status Code</span>
                <span className="font-mono text-emerald-400">{appState.healthStatus.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Last Check</span>
                <span className="font-mono text-slate-300">
                  {new Date(appState.healthStatus.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div >
          )}
        </div >

        {/* Device Control Panel (Room Grouped Section) */}
        <div className="pt-4 border-t border-slate-800">
            <h2 className="text-lg font-semibold text-slate-300 mb-4">Rooms</h2>
            <div className="space-y-6">
                {/* Group devices by room */}
                <>
                {Object.values(appState.devices)
                    .reduce((acc, device) => {
                        if (!acc[device.room]) {
                            acc[device.room] = [];
                        }
                        acc[device.room].push(device);
                        return acc;
                    }, {} as Record<string, DeviceState[]>)}
                {Object.keys(appState.devices).map((roomName) => (
                    <RoomContainer key={roomName} roomName={roomName} devices={Object.values(appState.devices).filter(d => d.room === roomName)} />
                ))}
                </>
            </div>
        </div >

        <div className="mt-8 text-center text-xs text-slate-500">
          Phase 2: Room Grouping & UX Redesign Complete
        </div>
      </div>
    </div >
  );
}

export default App;