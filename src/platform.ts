import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { ExamplePlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

// This is only required when using Custom Services and Characteristics not support by HomeKit
import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes';

// WebSocket server for local dashboard communication (Port 3001)
import { WebSocketServer } from 'ws';
const wsServer = new WebSocketServer({ port: 3001 });

/**
 * Broadcasts a state change payload to all connected web clients.
 */
const broadcastStateChange = (payload: any) => {
  wsServer.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
};

/**
 * Handles state change events and broadcasts them over WebSocket.
 */
const handleStateChange = (deviceId: string, characteristic: Characteristic, newValue: any) => {
  // Standardize the payload structure for the frontend
  const payload = { 
    type: 'state_change', 
    deviceId: deviceId, 
    characteristicName: characteristic.name, 
    value: newValue 
  };
  console.log('Broadcasting state change:', JSON.stringify(payload)); // Use console.log for visibility in Homebridge logs
  broadcastStateChange(payload);
};

/**
 * Wraps the standard Characteristic setter to intercept changes and broadcast them.
 */
const wrapCharacteristic = (characteristic: Characteristic) => {
  // Check if already wrapped to prevent multiple wrappers
  if ((characteristic as any).__wrapped_setter) {
    return characteristic as any; 
  }

  const originalSetter = characteristic.setValue.bind(characteristic);

  characteristic.setValue = function(value: any) {
    try {
      // 1. Check if the value actually changed before proceeding
      const oldValue = characteristic.getCharacteristicValue();
      if (oldValue === value) {
        return; // No change, do nothing
      }

      // 2. Call the original setter to update HomeKit state
      originalSetter(value);

      // 3. Broadcast the change to the local dashboard clients
      handleStateChange(characteristic.accessory.UUID, characteristic, value);
    } catch (e) {
      console.error('Error setting characteristic value:', e); // Use console.error for visibility in Homebridge logs
    }
  };
  // Attach a flag to identify the wrapped function
  (characteristic as any).__wrapped_setter = true;
  return characteristic; 
};

/**
 * Intercepts all characteristics on an accessory, applying the wrapper.
 */
const interceptCharacteristics = (accessory: PlatformAccessory) => {
  for (const [name, characteristic] of Object.entries(accessory.characteristics)) {
    // Apply the wrapper function to each characteristic's setter
    characteristic[name] = wrapCharacteristic(characteristic as Characteristic);
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
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
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
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.exampleUniqueId);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        new ExamplePlatformAccessory(this, existingAccessory);

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.exampleDisplayName);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.exampleDisplayName, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
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