import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse port from arguments
let port = "3000";
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = args[i + 1];
    break;
  } else if (args[i].startsWith("--port=")) {
    port = args[i].split("=")[1];
    break;
  } else if (!isNaN(Number(args[i]))) {
    // Sometimes the port is passed as a raw number argument
    port = args[i];
  }
}

console.log(`[Dev System] Starting backend and frontend (port: ${port})...`);

// Spawn backend
const backend = spawn("npm", ["run", "dev", "-w", "@smart-home/backend"], {
  stdio: "inherit",
  shell: true,
});

// Spawn frontend with the specified port
const frontend = spawn("npm", ["run", "dev", "-w", "@smart-home/frontend", "--", "--port", port], {
  stdio: "inherit",
  shell: true,
});

// Handle termination
const cleanup = () => {
  console.log("[Dev System] Stopping servers...");
  backend.kill();
  frontend.kill();
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
backend.on("exit", cleanup);
frontend.on("exit", cleanup);
