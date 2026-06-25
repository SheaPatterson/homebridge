import express, { Request, Response } from "express";
import cors from "cors";
import {
  Accessory,
  Categories,
  Characteristic,
  CharacteristicEventTypes,
  Service,
  uuid,
} from "hap-nodejs";
import { HealthResponse } from "@smart-home/shared";

const app = express();
const PORT = 3001;

app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  }),
);
app.use(express.json());

// --- In-memory state for the test HAP accessory ---
let lightIsOn = false;

// --- Health endpoint ---
app.get("/api/health", (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: "ok",
    timestamp: Date.now(),
  };
  res.json(response);
});

// --- Device toggle endpoint ---
app.post("/api/device/:id/toggle", (req: Request, res: Response) => {
  const { id } = req.params;

  if (id !== "light-1") {
    return res
      .status(404)
      .json({ success: false, message: `Device ${id} not found.` });
  }

  // Toggle the in-memory state and notify any HAP listeners.
  lightIsOn = !lightIsOn;
  console.log(`[Backend] Device ${id} toggled -> ${lightIsOn}`);

  return res.json({ success: true, newState: lightIsOn });
});

// --- HAP-NodeJS accessory setup ---
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

// --- Start server ---
app.listen(PORT, () => {
  console.log("\n========================================================");
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log("✅ HAP accessory published on port 51823 (pin 031-45-154)");
  console.log("========================================================\n");
});