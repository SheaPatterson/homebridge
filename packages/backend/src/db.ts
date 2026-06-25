import { Pool } from "pg";

// NOTE: In a real application, you would load the connection string 
// from environment variables (e.g., process.env.DATABASE_URL).
// For this simulation, we assume the Neon connection is handled by the calling context.

/**
 * Initializes and returns a PostgreSQL Pool client for database operations.
 * @param projectId The ID of the Neon project.
 * @returns A configured pg.Pool instance.
 */
export const getDbPool = (projectId: string): Pool => {
    // In a real scenario, we would use neon-postgres or similar library 
    // that handles connection pooling and credentials securely.
    console.log(`[DB] Initializing database pool for Project ID: ${projectId}`);
    
    // Placeholder implementation - actual connection logic depends on the environment setup.
    return new Pool({
        // Connection details would be dynamically provided by the runtime/environment
        // For demonstration, we assume a default configuration is available.
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
 * Helper function to simulate updating a device's state in the database.
 * @param pool The pg.Pool instance.
 * @param deviceId The ID of the device to update.
 * @param updates An object containing fields and their new values (e.g., { is_on: true, brightness: 50 }).
 */
export const updateDeviceStateInDb = async (pool: Pool, deviceId: string, updates: Partial<any>) => {
    const setClauses = Object.keys(updates).map((key, index) => `${key} = $${index + 1}`).join(", ");
    const values = Object.values(updates);

    if (!setClauses.length) {
        throw new Error("No updates provided.");
    }

    // Build the query dynamically to prevent SQL injection (though using parameterized queries is safer)
    let sql = `UPDATE devices SET ${setClauses}, last_updated = NOW() WHERE device_id = $${values.length + 1} RETURNING *;`;
    const params: any[] = [...values, deviceId];

    console.log(`[DB] Updating device ${deviceId} with state:`, updates);
    return runQuery(pool, sql, params);
};