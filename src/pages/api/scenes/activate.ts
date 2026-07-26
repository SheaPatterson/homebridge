import { NextApiRequest, NextApiResponse } from 'next';
import { processSceneActivation } from '@/services/mqtt-gateway';

/**
 * Handles POST requests to activate a predefined smart home scene.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { sceneName } = req.body;

  if (!sceneName || typeof sceneName !== 'string') {
      return res.status(400).json({ message: 'Scene name is required.' });
  }

  try {
    // 1. Trigger the gateway service to process the scene activation
    await processSceneActivation(sceneName);

    // 2. Return success status
    res.status(200).json({ message: `Scene '${sceneName}' activated successfully.` });

  } catch (error) {
    console.error("API Scene Activation Error:", error);
    res.status(500).json({ message: 'Failed to activate scene.' });
  }
}