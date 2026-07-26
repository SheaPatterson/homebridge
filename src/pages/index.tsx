"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { getDeviceStates, updateDeviceState } from '../utils/db';
import { processMqttMessage, MqttPayload } from '../services/mqtt-gateway';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// --- Component for displaying a single device state ---
const DeviceCard = ({ device }: { device: DeviceState }) => {
  if (!device) return null;

  let displayValue: string;
  let unit = '';

  switch (device.state_key) {
    case 'is_on':
      displayValue = device.value ? 'On' : 'Off';
      break;
    case 'brightness':
      displayValue = `${Math.round(device.value)}%`;
      unit = '%';
      break;
    default:
      displayValue = String(device.value);
  }

  return (
    <Card className="flex flex-col justify-between h-full">
      <CardHeader>
        <CardTitle>{device.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{device.device_id}</p>
      </CardHeader>
      <CardContent className="flex flex-col items-start justify-center pt-4">
        <div className="text-3xl font-bold flex items-baseline space-x-2">
          {displayValue}
          {unit && <span className="text-lg text-muted-foreground">{unit}</span>}
        </div >
        <p className="text-sm mt-1 text-gray-500">Last updated: {new Date(device.last_updated).toLocaleTimeString()}</p>
      </CardContent>
    </Card>
  );
};

// --- Main Dashboard Component ---
export default function IndexPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mqttPayloadInput, setMqttPayloadInput] = useState('{"isOn": true}');

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

  useEffect(() => {
    loadDeviceStates();
  }, [loadDeviceStates]);


  // Handler for simulating an incoming MQTT message
  const handleSimulateMqttMessage = async () => {
    try {
        // 1. Parse the JSON input from the user
        let payload: any;
        try {
            payload = JSON.parse(mqttPayloadInput);
        } catch (e) {
            alert("Invalid JSON format for MQTT Payload.");
            return;
        }

        // 2. Simulate the gateway receiving and processing the message
        const simulatedTopic = "home/livingroom/light/power"; // Fixed topic for simulation
        await processMqttMessage({ topic: simulatedTopic, payload });

        // 3. Refresh the UI to show the updated state from the database
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
        </div>
      )}
    </div>
  );
}