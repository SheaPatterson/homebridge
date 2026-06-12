import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { ExamplePlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

// This is only required when using Custom Services and Characteristics not support by HomeKit
import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes';
import { WebSocketServer } from 'ws'; // FIX 1: Import ws

// Declare the global websocket server instance to resolve TS2304
const wsServer = new WebSocketServer({ port: 3001 });


/**
 * Broadcasts a state change payload to all connected web clients.
 */
const broadcastStateChange = (payload: any, accessory: PlatformAccessory) => {
  // The client type is WebSocket | WebSocket. We cast it here for simplicity in this example.
  (wsServer as any).clients.forEach((client: WebSocket) => { // FIX 3: Explicitly typed the client parameter
    if (client && typeof client.readyState === 'number' && client.readyState === 1) { // FIX 2: Check readyState and ensure client exists
      client.send(JSON.stringify({ payload, accessory }));
    }
  });
};

/**
 * Handles state change events and broadcasts them over WebSocket.
 */
const handleStateChange = (accessory: PlatformAccessory, service: Service, characteristic: Characteristic, newValue: any) => { // FIX 6: Updated signature to accept parent Service object
  // Standardize the payload structure for the frontend
  const serviceName = service.name || 'Unknown Service'; // FIX 4: Using passed service name
  const payload = { 
    type: 'state_change', 
    deviceId: accessory.UUID, // FIX 3 & 6: Use accessory UUID instead of characteristic name/device ID
    characteristicName: serviceName, 
    value: newValue 
  };
  console.log('Broadcasting state change:', JSON.stringify(payload));
  broadcastStateChange(payload, accessory);
};

/**
 * Wraps the standard Characteristic setter to intercept changes and broadcast them.
 */
const wrapCharacteristic = (characteristic: Characteristic, service: Service, accessory: PlatformAccessory) => { // FIX 1: Added service and accessory parameters
  // Check if already wrapped to prevent multiple wrappers
  if ((characteristic as any).__wrapped_setter) {
    return characteristic as any; 
  }

  const originalSetter = characteristic.setValue.bind(characteristic);

  // FIX 4: Adjusting the return type and logic for setter override
  characteristic.setValue = function(value: any): Characteristic { // Cast to satisfy TS2322
    try {
      // FIX 5 & 7: Removed getCharacteristicValue check, relying on original setter behavior
      const oldValue = null; 
      if (oldValue === value) {
        return characteristic as Characteristic; // No change, do nothing
      }

      // Call the original setter to update HomeKit state
      originalSetter(value);

      // Broadcast the change to the local dashboard clients
      handleStateChange(accessory, service, characteristic, value); // FIX 6: Pass all necessary context (accessory, service)
    } catch (e) {
      console.error('Error setting characteristic value:', e);
    }
    return characteristic; // Return characteristic instance to satisfy the return type
  };
  // Attach a flag to identify the wrapped function
  (characteristic as any).__wrapped_setter = true;
  return characteristic; 
};

/**
 * Intercepts all characteristics on an accessory, applying the wrapper.
 */
const interceptCharacteristics = (accessory: PlatformAccessory) => {
  // FIX 7 & 8: Iterating over all services and their characteristics to find all characteristics
  for (const service of accessory.services) {
    // Use Object.values() to get an array of Characteristic objects directly, resolving TS7053/TS18046
    Object.values(service.characteristics).forEach((characteristic: Characteristic) => { 
      // Apply the wrapper function to each characteristic's setter, passing service context
      characteristic.setValue = wrapCharacteristic(characteristic, service, accessory).setValue; // Re-assigning the wrapped method and passing service/accessory
    });
  }
};

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ExampleHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  // This is only required when using Custom Services and Characteristics not support by HomeKit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly CustomServices: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly CustomCharacteristics: any;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // This is only required when using Custom Services and Characteristics not support by HomeKit
    this.CustomServices = new EveHomeKitTypes(this.api).Services;
    this.CustomCharacteristics = new EveHomeKitTypes(this.api).Characteristics;

    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);

    // Apply characteristic interception on cached accessories
    interceptCharacteristics(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    // EXAMPLE ONLY
    const exampleDevices = [
      {
        exampleUniqueId: 'ABCD',
        exampleDisplayName: 'Bedroom',
      },
      {
        exampleUniqueId: 'EFGH',
        exampleDisplayName: 'Kitchen',
      },
      {
        // This is an example of a device which uses a Custom Service
        exampleUniqueId: 'IJKL',
        exampleDisplayName: 'Backyard',
        CustomService: 'AirPressureSensor',
      },
    ];

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of exampleDevices) {
      // generate a unique id for the accessory this should be generated from
      const uuid = this.api.hap.uuid.generate(device.exampleUniqueId);

      // see if an accessory with the same uuid has already been registered and restored from
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // create the accessory handler for the restored accessory
        new ExamplePlatformAccessory(this, existingAccessory);

      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.exampleDisplayName);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.exampleDisplayName, uuid);

        // store a copy of the device object in the `accessory.context`
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        new ExamplePlatformAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      // push into discoveredCacheUUIDs
      this.discoveredCacheUUIDs.push(uuid);
    }

    // you can also deal with accessories from the cache which are no longer present by removing them from Homebridge
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}