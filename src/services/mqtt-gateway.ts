import { getDeviceStates, updateDeviceState } from '../utils/db';

/**
 * Defines the structure for an incoming raw MQTT message payload.
 */
export interface MqttPayload {
  topic: string; // e.g., "home/livingroom/light"
  payload: any;   // The actual data, e.g., { state: 'on', brightness: 80 }
}

/**
 * Defines the normalized device state structure to be stored in Neon.
 */
export interface DeviceState {
  deviceId: string; // Unique ID derived from the topic/device name
  deviceName: string;
  stateKey: string; // e.g., 'power', 'brightness'
  value: any;       // The actual state value (boolean, number, etc.)
  lastUpdated: Date;
}

/**
 * Processes a raw MQTT payload, normalizes it into structured device states, and updates the database.
 * @param mqttPayload The incoming message from the MQTT broker.
 */
export const processMqttMessage = async (mqttPayload: MqttPayload): Promise<void> => {
  console.log(`[MQTT Gateway] Received message on topic: ${mqttPayload.topic}`);

  // 1. Basic Topic Parsing and Device Identification
  const parts = mqttPayload.topic.split('/');
  if (parts.length < 3) {
    console.warn("Skipping malformed MQTT topic.");
    return;
  }

  // Assuming structure: home/room/device_type/state -> e.g., home/livingroom/light/power
  const room = parts[1]; // livingroom
  const deviceType = parts[2]; // light, thermostat, etc.
  const stateKey = parts[3] || 'status'; // power, brightness, temperature, etc.

  // 2. Payload Normalization (This is the core business logic)
  let normalizedStates: DeviceState[] = [];

  if (deviceType === 'light') {
    const payload = mqttPayload.payload;
    
    // Example: Handling a simple power state toggle
    if (stateKey === 'power' && typeof payload.isOn !== 'undefined') {
      normalizedStates.push({
        deviceId: `${room}-light`,
        deviceName: `Living Room Light`,
        stateKey: 'is_on',
        value: Boolean(payload.isOn), // Ensure boolean type
        lastUpdated: new Date(),
      });
    } 
    // Example: Handling brightness level (assuming payload has a 'brightness' field)
    else if (stateKey === 'brightness' && typeof payload.brightness !== 'undefined') {
       normalizedStates.push({
        deviceId: `${room}-light`,
        deviceName: `Living Room Light`,
        stateKey: 'brightness',
        value: Number(payload.brightness), // Ensure number type
        lastUpdated: new Date(),
      });
    } else {
      console.warn(`[MQTT Gateway] Could not normalize state for light device from payload: ${JSON.stringify(payload)}`);
      return;
    }

  } else if (deviceType === 'thermostat') {
    const payload = mqttPayload.payload;
    // Example: Handling temperature readings
    if (stateKey === 'temperature' && typeof payload.temperature !== 'undefined') {
       normalizedStates.push({
        deviceId: `${room}-thermo`,
        deviceName: `Living Room Thermostat`,
        stateKey: 'temperature',
        value: Number(payload.temperature), // Ensure number type
        lastUpdated: new Date(),
      });
    } else {
      console.warn(`[MQTT Gateway] Could not normalize state for thermostat device from payload: ${JSON.stringify(payload)}`);
      return;
    }
  } else {
    // Add logic for other devices (e.g., 'sensor') here
    console.log(`[MQTT Gateway] Unsupported device type received: ${deviceType}`);
    return;
  }

  // 3. Database Update
  if (normalizedStates.length > 0) {
    try {
      await updateDeviceState(normalizedStates);
      console.log(`[MQTT Gateway] Successfully updated state for ${normalizedStates.length} device(s).`);
    } catch (error) {
      console.error("[MQTT Gateway] Failed to update database:", error);
    }
  }
};

/**
 * Simulates the continuous listening loop of an MQTT client.
 * In a real application, this would be managed by an external library like 'mqttjs'.
 */
export const startMqttGatewaySimulation = async () => {
    console.log("--- Starting MQTT Gateway Simulation ---");
    // Simulate receiving messages over time
    await processMqttMessage({ topic: "home/livingroom/light/power", payload: { isOn: true } });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    await processMqttMessage({ topic: "home/kitchen/thermostat/temperature", payload: { temperature: 22.5 } }); // Will be ignored for now
    await new Promise(resolve => setTimeout(resolve, 1000));
    await processMqttMessage({ topic: "home/livingroom/light/brightness", payload: { brightness: 75 } });
};

export default {
  processMqttMessage,
  startMqttGatewaySimulation
};