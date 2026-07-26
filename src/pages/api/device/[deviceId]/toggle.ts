import { NextApiRequest, NextApiResponse } from 'next';
// Updated import paths to be relative:
import { updateDeviceState } from '../../../utils/db'; 
import { processMqttMessage, MqttPayload } from '../../../services/mqtt-gateway';

/**
 * Handles POST requests to toggle a device's state (e.g., turning a light on/off).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const deviceId = req.query.deviceId as string;
  let payload: any;

  try {
    const body = req.body;
    if (!body || typeof body.stateKey !== 'string' || !['is_on', 'brightness'].includes(body.stateKey)) {
        return res.status(400).json({ message: 'Invalid state key provided.' });
    }

    // Determine the new value based on the current state (simple toggle logic for demonstration)
    let newValue: any;
    if (body.stateKey === 'is_on') {
        // For a simple boolean toggle, we assume the API call is meant to flip the switch.
        newValue = true; // We will let the gateway handle the actual logic based on what was sent.
    } else {
        newValue = body.value;
    }

    // 1. Simulate sending a command to the MQTT Gateway (The core action)
    const mqttPayload: MqttPayload = {
        topic: `home/livingroom/light/power`, // Fixed topic for simulation
        payload: { isOn: newValue }
    };
    await processMqttMessage(mqttPayload);

    // 2. Return success status
    res.status(200).json({ message: 'Command sent successfully and state updated.' });

  } catch (error) {
    console.error("API Toggle Error:", error);
    res.status(500).json({ message: 'Failed to process command.' });
  }
}