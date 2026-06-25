import express, { Request, Response } from "express";
import cors from "cors";
import { Accessory, Characteristic, CharacteristicEventTypes, Service, uuid } from "hap-nodejs";
import { HealthResponse } from "@smart-home/shared";

const app = express();
const PORT = 3001;

const corsOptions = {
  origin: function (origin: any) {
    // Allow requests from localhost:3000 (frontend dev server) and any origin for simplicity during development
    if (!origin || ['localhost:3000', '::1'].includes(typeof origin === 'string' ? origin : '')) {
      return true;
    }
    return false;
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  const response: HealthResponse = {
    status: "ok",
    timestamp: Date.now(),
  };
  res.json(response);
});

// --- NEW DEVICE CONTROL ENDPOINT ---
app.post("/api/device/:id/toggle", async (req: Request, res: Response) => {
    const deviceId = req.params.id;
    const accessory = new Accessory("Test Light", "hap-nodejs:accessories:test-light"); // Assuming we only control this one for now

    // In a real scenario, we would map the incoming deviceId to the correct accessory/service instance.
    // For simplicity, we'll assume 'light-1' maps to our test light service.
    if (deviceId !== "light-1") {
        return res.status(404).json({ success: false, message: `Device ${deviceId} not found.` });
    }

    const lightService = accessory.getService("Test Lightbulb");
    if (!lightService) {
        return res.status(500).json({ success: false, message: "Light service not initialized." });
    }

    // Get current state to determine the new state
    let currentState: boolean;
    try {
        currentState = lightService.getCharacteristic(Characteristic.On).value as boolean; // FIX: Use .value property for HAP-NodeJS getter
    } catch (e) {
        console.error("Error getting initial state:", e);
        return res.status(500).json({ success: false, message: "Could not read current device state." });
    }

    const newState = !currentState;
    try {
        // Set the new value and wait for the characteristic to update (simulated)
        lightService.getCharacteristic(Characteristic.On).setValue(newState);
        console.log(`HAP: Successfully set light state to ${newState}`);
        res.json({ success: true, newState: newState });
    } catch (e) {
        console.error("Error setting device state:", e);
        res.status(500).json({ success: false, message: "Failed to update device state via HAP." });
    }
});


// Initialize a simple HAP-NodeJS accessory to verify it works
const accessoryUuid = uuid.generate("hap-nodejs:accessories:test-light");
const accessory = new Accessory("Test Light", accessoryUuid);

const lightService = new Service.Lightbulb("Test Lightbulb");
lightService.getCharacteristic(Characteristic.On)
  .on(CharacteristicEventTypes.GET, (callback: (err: Error | null, value?: any) => void) => {
    console.log("HAP: Get Light State");
    // Initialize state to false for the test light
    callback(null, false); 
  })
  .on(CharacteristicEventTypes.SET, (value: any, callback: () => void) => {
    console.log("HAP: Set Light State to", value);
    callback();
  });

accessory.addService(lightService);

// Start Express server
app.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(`✅ Backend server running successfully on http://localhost:${PORT}`);
  console.log("HAP-NodeJS accessory initialized successfully.");
  console.log(`========================================================\n`);
});