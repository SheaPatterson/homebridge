import { NeonClient } from '@neondatabase/client';
// Assuming 'neon' is configured elsewhere and we get an instance here
const neonConfig = process.env.NEON_CONFIG; 

if (!neonConfig) {
    throw new Error("Neon configuration not found in environment variables.");
}

const client = new NeonClient({
  connectionString: `postgresql://${process.env.NEON_USER}:${process.env.NEON_PASSWORD}@${process.env.NEON_HOST}:5432/${process.env.NEON_DATABASE}`,
});


/**
 * Updates the state of one or more devices in a single transaction.
 * @param states An array of normalized device states from the MQTT Gateway.
 */
export const updateDeviceState = async (states: { deviceId: string; deviceName: string; stateKey: string; value: any; lastUpdated: Date }[]) => {
  if (!states || states.length === 0) return;

  await client.query('BEGIN');
  try {
    for (const state of states) {
      // Use UPSERT logic to either insert a new device or update an existing one's state.
      await client.query(`
        INSERT INTO devices (device_id, device_name, state_key, value, last_updated) 
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (device_id) DO UPDATE SET 
          state_key = EXCLUDED.state_key,
          value = EXCLUDED.value,
          last_updated = EXCLUDED.last_updated;
      `, [
        state.deviceId,
        state.deviceName,
        state.stateKey,
        state.value,
        state.lastUpdated
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};

// Existing functions...
export const getDeviceStates = async () => {
    const result = await client.query(`
        SELECT device_id, device_name, state_key, value, last_updated 
        FROM devices 
        ORDER BY last_updated DESC;
    `);
    return result.rows;
};

// ... (Keep other existing functions like getRoomDevices, etc.)