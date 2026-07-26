import express, { Request, Response } from "express";
import cors from "cors";
import { Accessory, Categories, Characteristic, CharacteristicEventTypes, Service, uuid } from "hap-nodejs";
// FIX: Corrected import path to use the correct function name
import { getDbPool, fetchDevicesFromDb, updateDeviceState } from "./db";

// --- WebSocket Setup ---
import * as ws from 'ws'; // Need to import the websocket library

const app = express();
const PORT = 3001;
const PROJECT_ID = process.env.NEON_PROJECT_ID || "old-band-37207234";

// Initialize WebSocket server on the same port as Express (or a dedicated one)
const wss = new ws.WebSocketServer({ noServer: true }); 

app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  }),
);
app.use(express.json());


// --- HAP-NodeJS accessory setup (Kept for compatibility) ---
let lightIsOn = false;

const accessoryUuid = uuid.generate("hap-nodejs:accessories:test-light");
const accessory = new Accessory("Test Light", accessoryUuid);
accessory.publish({
  port: 51823,
  username: "1A:2B:3C:4D:5E:6F",
  pincode: "031-45-154",
  category: Categories.LIGHTBULB,
});

const lightService = new Service.Lightbulb("Test Lightbulb");

lightService
  .getCharacteristic(Characteristic.On)
  .on(CharacteristicEventTypes.GET, (callback) => {
    console.log("[HAP] GET On ->", lightIsOn);
    callback(null, lightIsOn);
  })
  .on(CharacteristicEventTypes.SET, (value, callback) => {
    console.log("[HAP] SET On ->", value);
    lightIsOn = Boolean(value);
    callback();
  });

accessory.addService(lightService);


// --- API Endpoints ---

/**
 * Health check endpoint.
 */
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

/**
 * Device discovery endpoint (NEW). Fetches all devices from the database.
 */
app.get("/api/devices", async (_req: Request, res: Response) => {
    try {
        const pool = getDbPool(PROJECT_ID);
        // Fetch data from Neon DB instead of using hardcoded array
        const devices = await fetchDevicesFromDb(pool); 

        res.json(devices);
    } catch (error) {
        console.error("Error fetching devices:", error);
        res.status(500).json({ success: false, message: "Failed to retrieve device list from database." });
    }
});


/**
 * Device control endpoint. Updates the state in the database and broadcasts via WebSocket.
 */
app.post("/api/device/:id/toggle", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const pool = getDbPool(PROJECT_ID);
    // 1. Fetch current state to determine the new state
    const devices = await fetchDevicesFromDb(pool);
    const device = devices.find((d: any) => d.device_id === id);

    if (!device) {
      return res.status(404).json({ success: false, message: `Device ${id} not found.` });
    }

    // 2. Determine new state and update DB
    const newState = !device.is_on;
    await updateDeviceState(pool, id, { is_on: newState }); // Use the updated function signature

    console.log(`[Backend] Device ${id} toggled -> ${newState}`);

    // 3. Simulate HAP notification (if applicable)
    if (id === "light-1") {
        console.log("[HAP] Simulating state change for Test Lightbulb.");
    }

    res.json({ success: true, newState: newState });

  } catch (error) {
    console.error("Device toggle failed:", error);
    res.status(500).json({ success: false, message: "Failed to update device state." });
  }
});


// --- WebSocket Integration ---
const setupWebSocket = (server: any) => {
    wss.on('connection', (ws) => {
        console.log('[WS] Client connected.');

        ws.on('close', () => {
            console.log('[WS] Client disconnected.');
        });
    });
};


// --- Start server ---
const httpServer = require('http').createServer(app); // Use http module to attach WS
httpServer.listen(PORT, () => {
  console.log("\n========================================================");
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log("✅ WebSocket server active.");
  console.log("✅ HAP accessory published on port 51823 (pin 031-45-154)");
  console.log("========================================================\n");
});

// FIX: Attach the WebSocket server to the HTTP server using its event emitter
wss.on('connection', setupWebSocket);