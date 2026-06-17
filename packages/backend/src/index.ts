import express, { Request, Response } from "express";
import cors from "cors";
import { Accessory, Characteristic, CharacteristicEventTypes, Service, uuid } from "hap-nodejs";
import { HealthResponse } from "@smart-home/shared";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  const response: HealthResponse = {
    status: "ok",
    timestamp: Date.now(),
  };
  res.json(response);
});

// Initialize a simple HAP-NodeJS accessory to verify it works
const accessoryUuid = uuid.generate("hap-nodejs:accessories:test-light");
const accessory = new Accessory("Test Light", accessoryUuid);

const lightService = new Service.Lightbulb("Test Lightbulb");
lightService.getCharacteristic(Characteristic.On)
  .on(CharacteristicEventTypes.GET, (callback: (err: Error | null, value?: any) => void) => {
    console.log("HAP: Get Light State");
    callback(null, false);
  })
  .on(CharacteristicEventTypes.SET, (value: any, callback: () => void) => {
    console.log("HAP: Set Light State to", value);
    callback();
  });

accessory.addService(lightService);

// Start Express server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log("HAP-NodeJS accessory initialized successfully");
});
