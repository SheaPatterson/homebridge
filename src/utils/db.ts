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

/**
 * Retrieves all defined scenes from the database.
 */
export const getScenes = async () => {
    const result = await client.query(`
        SELECT scene_id, scene_name FROM scenes ORDER BY scene_name ASC;
    `);
    return result.rows;
};

/**
 * Retrieves all device states associated with a specific scene name.
 */
export const getSceneDetails = async (sceneName: string) => {
    const result = await client.query(`
        SELECT action_device_id, action_state_key, action_value 
        FROM scene_actions WHERE scene_name = $1;
    `, [sceneName]);
    return result.rows;
};

/**
 * Seeds the database with initial sample data for devices and scenes.
 */
export const seedDatabase = async () => {
    console.log("--- Starting Database Seeding ---");
    try {
        // 1. Create necessary tables if they don't exist (Idempotent)
        await client.query(`
            CREATE TABLE IF NOT EXISTS devices (
                device_id VARCHAR(50) PRIMARY KEY,
                device_name VARCHAR(100) NOT NULL,
                state_key VARCHAR(50) NOT NULL,
                value TEXT NOT NULL,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS scenes (
                scene_id SERIAL PRIMARY KEY,
                scene_name VARCHAR(100) UNIQUE NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS scene_actions (
                action_id SERIAL PRIMARY KEY,
                scene_name VARCHAR(100) REFERENCES scenes(scene_name),
                action_device_id VARCHAR(50) NOT NULL,
                action_state_key VARCHAR(50) NOT NULL,
                action_value TEXT NOT NULL,
                UNIQUE (scene_name, action_device_id, action_state_key)
            );
        `);

        // 2. Seed Sample Scenes and Actions (Only if they don't exist)
        const scenesToSeed = [
            { name: "Good Morning", actions: [
                { deviceId: "livingroom-light", stateKey: "is_on", value: true },
                { deviceId: "livingroom-thermo", stateKey: "temperature", value: 21.5 }
            ]},
            { name: "Good Night", actions: [
                { deviceId: "livingroom-light", stateKey: "is_on", value: false },
                { deviceId: "livingroom-thermo", stateKey: "temperature", value: 18.0 }
            ]}
        ];

        for (const scene of scenesToSeed) {
            // Check if the scene already exists to prevent unique constraint violation
            await client.query(`SELECT 1 FROM scenes WHERE scene_name = $1`, [scene.name]);
            
            if (!((await client.query('SELECT 1 FROM scenes WHERE scene_name = $1', [scene.name])).rowCount)) {
                // Insert Scene
                await client.query(`INSERT INTO scenes (scene_name) VALUES ($1)`, [scene.name]);

                // Insert Actions for the new scene
                for (const action of scene.actions) {
                    await client.query(`
                        INSERT INTO scene_actions (scene_name, action_device_id, action_state_key, action_value) 
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (scene_name, action_device_id, action_state_key) DO NOTHING;
                    `, [scene.name, action.deviceId, action.stateKey, String(action.value)]);
                }
            }
        }

        console.log("Database seeding complete: Scenes and sample actions are ready.");

    } catch (error) {
        console.error("Error during database seeding:", error);
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