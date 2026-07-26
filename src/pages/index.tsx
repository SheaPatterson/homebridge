"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { getDeviceStates, updateDeviceState, getScenes, getSceneDetails } from '../utils/db';
import { processMqttMessage, MqttPayload } from '../services/mqtt-gateway';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// --- Component for displaying a single device state ---
const DeviceCard = ({ device }: { device: any }) => {
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async (currentValue: any) => {
    if (isToggling) return;
    setIsToggling(true);

    let payloadToSend: MqttPayload;
    let apiEndpoint: string;
    let toggleAction: () => Promise<void>;

    // Determine action based on device type/state key
    if (device.state_key === 'is_on') {
        // Light Toggle Logic
        payloadToSend = { topic: `home/livingroom/light/power`, payload: { isOn: !currentValue } };
        apiEndpoint = `/api/device/${device.device_id}/toggle`;
        toggleAction = async () => {
            await fetch(apiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
        };
    } else if (device.state_key === 'temperature') {
        // Thermostat Control Logic (Simulating setting a target temperature)
        const newTemp = Math.round(currentValue === 21 ? 23 : 21); // Simple toggle between 21 and 23
        payloadToSend = { topic: `home/livingroom/thermostat/target`, payload: { targetTemperature: newTemp } };
        apiEndpoint = `/api/device/${device.device_id}/set-temperature`;
        toggleAction = async () => {
            await fetch(apiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
        };
    } else {
        // Fallback for other devices
        setIsToggling(false);
        return;
    }

    try {
      // 1. Call the Backend API first (The primary control method)
      await toggleAction();

      // 2. Simulate the MQTT Gateway receiving the state change (The integration layer)
      await processMqttMessage(payloadToSend); 

    } catch (error) {
      console.error("Toggle failed:", error);
    } finally {
      setIsToggling(false);
    }
  };


  let displayValue: string;
  let unit = '';
  let controlButton: React.ReactNode; // Declare the variable type

  switch (device.state_key) {
    case 'is_on':
      displayValue = device.value ? 'On' : 'Off';
      break;
    case 'brightness':
      displayValue = `${Math.round(device.value)}%`;
      unit = '%';
      break;
    case 'temperature':
        displayValue = `${parseFloat(device.value).toFixed(1)}°C`;
        unit = ''; // Unit is in the display value itself
        break;
    default:
      displayValue = String(device.value);
  }

  // Render the appropriate control button/toggle based on device type
  if (device.state_key === 'is_on') {
    controlButton = (
        <button
          onClick={() => handleToggle(!device.value)} // Pass the current state to toggle
          disabled={isToggling}
          aria-label={`Toggle ${device.device_name}`}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${device.value ? 'bg-emerald-600' : 'bg-slate-700'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${!device.value ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
    );
  } else if (device.state_key === 'temperature') {
      controlButton = (
        <Button 
            onClick={() => handleToggle(parseFloat(device.value))} // Pass the current temperature value
            disabled={isToggling}
            variant="outline"
          >
            {isToggling ? '...' : `Set Target to ${Math.round(parseFloat(device.value) === 21 ? 23 : 21)}°C`}
        </Button>
      );
  } else {
    controlButton = null; // Handle unknown device types gracefully
  }


  return (
    <Card className="flex flex-col justify-between h-full">
      <CardHeader>
        <CardTitle>{device.device_name}</CardTitle>
        <p className="text-sm text-muted-foreground">{device.device_id}</p>
      </CardHeader>
      <CardContent className="flex flex-col items-start justify-center pt-4">
        <div className="text-3xl font-bold flex items-baseline space-x-2">
          {displayValue}
          {unit && <span className="text-lg text-muted-foreground">{unit}</span>}
        </div >
        <p className="text-sm mt-1 text-gray-500">Last updated: {new Date(device.last_updated).toLocaleTimeString()}</p>
      </CardContent>
      {/* Control Toggle */}
      <div className="mt-4 pt-4 border-t border-slate-800">
        {controlButton}
      </div>
    </Card>
  );
};

// --- Main Dashboard Component ---
export default function IndexPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mqttPayloadInput, setMqttPayloadInput] = useState('{"isOn": true}');
  const [scenes, setScenes] = useState<any[]>([]);
  const [sceneLoading, setSceneLoading] = useState(false);

  // Function to fetch and display current device states from the database
  const loadDeviceStates = useCallback(async () => {
    setLoading(true);
    try {
      const states = await getDeviceStates();
      setDevices(states);
    } catch (error) {
      console.error("Failed to load device states:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to fetch and display available scenes
  const loadScenes = useCallback(async () => {
    setSceneLoading(true);
    try {
        const sceneList = await getScenes();
        setScenes(sceneList);
    } catch (error) {
        console.error("Failed to load scenes:", error);
    } finally {
        setSceneLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeviceStates();
    loadScenes(); // Load scenes on initial mount
  }, [loadDeviceStates, loadScenes]);


  // Handler for simulating an incoming MQTT message
  const handleSimulateMqttMessage = async () => {
    try {
        let payload: any;
        try {
            payload = JSON.parse(mqttPayloadInput);
        } catch (e) {
            alert("Invalid JSON format for MQTT Payload.");
            return;
        }

        // 1. Simulate the gateway receiving and processing the message
        const simulatedTopic = "home/livingroom/light/power"; // Fixed topic for simulation
        await processMqttMessage({ topic: simulatedTopic, payload });

        // 2. Refresh the UI to show the updated state from the database
        loadDeviceStates();

    } catch (error) {
      console.error("Simulation failed:", error);
    }
  };


  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Smart Home Dashboard</h1>
      <p className="mb-8 text-muted-foreground">Centralized view of all connected devices.</p>

      {/* MQTT Simulation Section */}
      <Card className="mb-10 p-6 border-l-4 border-blue-500 shadow-lg">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">🔌 MQTT Gateway Simulation</h2>
            <Button onClick={handleSimulateMqttMessage} disabled={loading}>
                {loading ? 'Processing...' : 'Process Simulated Message'}
            </Button>
        </div>
        <p className="mb-4 text-sm text-gray-600">Enter a JSON payload to simulate an incoming MQTT message (e.g., `{"isOn": true}`). This simulates the gateway receiving data.</p>
        <textarea 
            className="w-full p-2 border rounded-md font-mono text-sm focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            value={mqttPayloadInput}
            onChange={(e) => setMqttPayloadInput(e.target.value)}
        />
      </Card>

      {/* Scenes Panel */}
      <h2 className="text-2xl font-bold mb-6">✨ Automation Scenes</h2>
      <Card className="mb-10 p-6 border-l-4 border-purple-500 shadow-lg">
        <div className="flex flex-wrap gap-4 items-center justify-between">
            <p className="text-sm text-gray-600 mb-2">Activate a routine with one click:</p>
            {scenes.length === 0 ? (
                <p className='text-muted-foreground'>No scenes defined yet.</p>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {scenes.map((scene) => (
                        <Button key={scene.scene_id} onClick={() => {
                            // Trigger the API call to activate the scene
                            fetch('/api/scenes/activate', {
                                method: 'POST',
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ sceneName: scene.scene_name })
                            })
                            .then(() => loadDeviceStates()) // Refresh UI after successful activation
                            .catch(err => console.error("Failed to activate scene:", err))
                        }}>
                            {scene.scene_name}
                        </Button>
                    ))}
                </div>
            )}
        </div >
      </Card>

      {/* Device Grid */}
      <h2 className="text-2xl font-bold mb-6">Current Device Status</h2>
      
      {loading ? (
        <div className="flex justify-center items-center h-48"><p>Loading device data...</p></div>
      ) : devices.length === 0 ? (
        <div className="text-center p-12 border rounded-lg bg-gray-50">No devices found. Please ensure the database has been populated.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            <DeviceCard key={device.device_id + device.state_key} device={device} />
          ))}
        </div >
      )}
    </div>
  );
}