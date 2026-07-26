// src/core/persistence/migrations/001_init.sql
-- This file contains the initial schema definition for the smart home hub.

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_online BOOLEAN DEFAULT 0,
    last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- Junction table for many-to-many relationship: Room <-> Device
CREATE TABLE IF NOT EXISTS room_devices (
    room_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (room_id, device_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- Table to store the last known state of a device for recovery purposes
CREATE TABLE IF NOT EXISTS device_states (
    device_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL, -- JSON string representation of {isOn: boolean, brightness: number}
    last_updated INTEGER NOT NULL
);

-- Table to store adapter-specific configuration settings
CREATE TABLE IF NOT EXISTS adapter_settings (
    adapter_id TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL
);