import { Pool } from "pg";
// Assuming 'neon' is configured elsewhere and we get an instance here
const neonConfig = process.env.NEON_CONFIG; 

if (!neonConfig) {
    throw new Error("Neon configuration not found in environment variables.");
}

// NOTE: In a real setup, the WebSocket server would be passed into this module or accessed globally.
let wssInstance: any = null; 

/**
 * Sets the global WebSocket instance used for broadcasting state changes.
 * @param wsServer The active WebSocket server instance.
 */
export const setWebSocketEmitter = (wsServer: any) => {
    wssInstance = wsServer;
};


/**
 * Initializes and returns a PostgreSQL Pool client for database operations.
 * @param projectId The ID of the Neon project.
 * @returns A configured pg.Pool instance.
 */
export const getDbPool = (projectId: string): Pool => {
    // ... (rest of function remains the same)
    console.log(`[DB] Initializing database pool for Project ID: ${projectId}`);
    
    return new Pool({
        connectionString: process.env.DATABASE_URL || "postgresql://user:password@host:port/neondb?sslmode=require",
    });
};

/**
 * Executes a single SQL query against the database pool.
 * @param pool The pg.Pool instance.
 * @param sql The SQL statement to execute.
 * @param params Optional array of parameters for the query.
 * @returns A promise that resolves with the query result rows.
 */
export const runQuery = async (pool: Pool, sql: string, params?: any[]) => {
    console.log(`[DB] Executing SQL: ${sql}`);
    try {
        const client = await pool.connect();
        try {
            // Use the parameterized query feature of pg library
            const res = await client.query(sql, params); 
            return res.rows;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("[DB] Error executing query:", error);
        throw new Error("Database query failed.");
    }
};

/**
 * Helper function to simulate fetching all devices from the database.
 * @param pool The pg.Pool instance.
 * @returns A promise resolving to an array of DeviceState objects.
 */
export const fetchDevicesFromDb = async (pool: Pool): Promise<any[]> => {
    const query = `
        SELECT 
            d.device_id, d.name, d.type, d.is_on, d.brightness, d.temperature, d.last_updated, r.name AS room_name
        FROM devices d
        JOIN rooms r ON d.room_id = r.id;
    `;
    return runQuery(pool, query);
};

/**
 * Helper function to simulate updating a device's state in the database AND broadcast the change.
 * @param pool The pg.Pool instance.
 * @param deviceId The ID of the device to update.
 * @param updates An object containing fields and their new values (e.g., { is_on: true, brightness: 50 }).
 */
export const updateDeviceState = async (pool: Pool, deviceId: string, updates: Partial<any>) => {
    const setClauses = Object.keys(updates).map((key, index) => `${key} = $${index + 1}`).join(", ");
    const values = Object.values(updates);

    if (!setClauses.length) {
        throw new Error("No updates provided.");
    }

    let sql = `UPDATE devices SET ${setClauses}, last_updated = NOW() WHERE device_id = $${values.length + 1} RETURNING *;`;
    const params: any[] = [...values, deviceId];

    console.log(`[DB] Updating device ${deviceId} with state:`, updates);
    const result = await runQuery(pool, sql, params);
    
    // --- REAL-TIME BROADCASTING LOGIC ---
    if (wssInstance) {
        const payload = JSON.stringify({ 
            type: 'DEVICE_UPDATE', 
            data: result[0] || null 
        });
        console.log(`[DB Broadcast] Emitting state update for ${deviceId} via WebSocket.`);
        wssInstance.clients.forEach(client => {
            if (client.readyState === ws.WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }

    return result[0]; // Return the updated device record
};