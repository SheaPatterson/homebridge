import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { Accessory, Categories, Characteristic, CharacteristicEventTypes, Service, uuid } from "hap-nodejs";
import { z } from "zod";
import { Hub } from "./core/hub.js";
import {
  DeviceCommandSchema,
  HealthResponse,
  PairingInputSchema,
  RoomCreateSchema,
  RoomUpdateSchema,
} from "./core/types.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
let hub: Hub | null = null;

app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

// --- HAP-NodeJS accessory setup (Kept for HomeKit compatibility) ---
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
    callback(null, lightIsOn);
  })
  .on(CharacteristicEventTypes.SET, (value, callback) => {
    lightIsOn = Boolean(value);
    callback();
  });
accessory.addService(lightService);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHub(): Hub {
  if (!hub) throw new Error("Hub is not initialised");
  return hub;
}

function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const err = new Error(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  return result.data;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

/** Health check. Returns adapter health and uptime. */
app.get(
  "/api/health",
  asyncHandler(async (_req, res) => {
    const h = getHub();
    const adapters = await h.registry.healthAll();
    const status: HealthResponse["status"] = adapters.some((a) => a.status === "down")
      ? "degraded"
      : "ok";
    const payload: HealthResponse = {
      status,
      timestamp: Date.now(),
      adapters,
      uptime: process.uptime(),
    };
    res.json(payload);
  }),
);

// --- Devices ---

app.get(
  "/api/devices",
  asyncHandler(async (_req, res) => {
    const h = getHub();
    const snap = h.deviceRegistry.snapshot();
    res.json(snap);
  }),
);

app.get(
  "/api/devices/:id",
  asyncHandler(async (req, res) => {
    const h = getHub();
    const device = h.deviceRegistry.get(req.params.id);
    if (!device) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(device);
  }),
);

app.post(
  "/api/devices/:id/command",
  asyncHandler(async (req, res) => {
    const h = getHub();
    const command = validate(DeviceCommandSchema, req.body);
    await h.mutex.run(() => h.deviceRegistry.command(req.params.id, command));
    res.json({ success: true });
  }),
);

// --- Rooms ---

app.get(
  "/api/rooms",
  asyncHandler(async (_req, res) => {
    const h = getHub();
    res.json(await h.roomService.list());
  }),
);

app.post(
  "/api/rooms",
  asyncHandler(async (req, res) => {
    const h = getHub();
    const body = validate(RoomCreateSchema, req.body);
    const room = await h.mutex.run(() => h.roomService.create(body.name, body.order ?? 0));
    res.status(201).json(room);
  }),
);

app.patch(
  "/api/rooms/:id",
  asyncHandler(async (req, res) => {
    const h = getHub();
    const body = validate(RoomUpdateSchema, req.body);
    const room = await h.mutex.run(() => h.roomService.update(req.params.id, body));
    if (!room) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(room);
  }),
);

app.delete(
  "/api/rooms/:id",
  asyncHandler(async (req, res) => {
    const h = getHub();
    await h.mutex.run(() => h.roomService.remove(req.params.id));
    res.status(204).end();
  }),
);

app.post(
  "/api/rooms/:id/devices",
  asyncHandler(async (req, res) => {
    const h = getHub();
    const body = validate(z.object({ deviceId: z.string().min(1) }), req.body);
    await h.mutex.run(() => h.roomService.assignDevice(req.params.id, body.deviceId));
    res.status(204).end();
  }),
);

app.delete(
  "/api/rooms/:id/devices/:deviceId",
  asyncHandler(async (req, res) => {
    const h = getHub();
    await h.mutex.run(() => h.roomService.unassignDevice(req.params.id, req.params.deviceId));
    res.status(204).end();
  }),
);

// --- Adapters ---

app.get(
  "/api/adapters",
  asyncHandler(async (_req, res) => {
    const h = getHub();
    const health = await h.registry.healthAll();
    const list = h.registry.list().map((l) => ({
      id: l.adapter.id,
      displayName: l.adapter.displayName,
      version: l.adapter.version,
      state: l.state,
      lastError: l.lastError,
      health: health.find((hh) => hh.adapterId === l.adapter.id) ?? null,
    }));
    res.json(list);
  }),
);

app.post(
  "/api/adapters/:id/discover",
  asyncHandler(async (req, res) => {
    const h = getHub();
    const iter = h.registry.startDiscovery(req.params.id);
    const out: unknown[] = [];
    try {
      for await (const d of iter) {
        out.push(d);
        if (out.length >= 50) break; // safety cap
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }
    res.json(out);
  }),
);

app.post(
  "/api/adapters/:id/pair",
  asyncHandler(async (req, res) => {
    const h = getHub();
    const body = validate(PairingInputSchema, req.body ?? {});
    const iter = h.registry.beginPairing(req.params.id, body);
    const steps: unknown[] = [];
    for await (const step of iter) {
      steps.push(step);
      if (step.terminal) break;
    }
    res.json(steps);
  }),
);

app.post(
  "/api/adapters/:id/abort",
  asyncHandler(async (req, res) => {
    const h = getHub();
    await h.registry.abortPairing(req.params.id);
    res.status(204).end();
  }),
);

// --- Logs (Phase 5) ---

app.get(
  "/api/logs",
  asyncHandler(async (_req, res) => {
    res.json({ logs: [], note: "Structured logs land in Phase 5." });
  }),
);

// --- Support bundle (Phase 7) ---

app.get(
  "/api/support-bundle",
  asyncHandler(async (_req, res) => {
    const h = getHub();
    res.json({
      version: "1.0.0",
      adapters: await h.registry.healthAll(),
      uptime: process.uptime(),
      node: process.version,
    });
  }),
);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler — RFC 7807-style problem details.
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  res.status(status).json({
    type: "about:blank",
    title: err.name || "Error",
    status,
    detail: err.message,
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main() {
  hub = new Hub();
  await hub.init();
  app.listen(PORT, () => {
    console.log("\n========================================================");
    console.log(`✅ Smart Home Hub backend running on http://localhost:${PORT}`);
    console.log("✅ HAP accessory published on port 51823 (pin 031-45-154)");
    console.log("========================================================\n");
  });
}

main().catch((err) => {
  console.error("[backend] fatal:", err);
  process.exit(1);
});