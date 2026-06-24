import React from 'react';

export interface HealthResponse {
  status: "ok";
  timestamp: number;
}

export interface DeviceState {
  id: string;
  name: string;
  type: string; // e.g., 'light', 'thermostat'
  isOn: boolean;
  brightness?: number;
  temperature?: number;
  lastUpdated: number; // Added lastUpdated field
}

/**
 * Global state structure for the entire smart home system.
 */
export interface AppState {
    healthStatus: HealthResponse | null;
    devices: Record<string, DeviceState>; // Keyed by device ID
    isLoading: boolean;
    error: string | null;
}

/**
 * Custom hook to manage persistent state using localStorage.
 * @param key The key used in localStorage.
 * @param initialValue The default value if no data is found.
 */
export function usePersistentState<T>(key: string, initialValue: T): [T, (newValue: Partial<T>) => void] {
    const [state, setState] = React.useState<T>(() => {
        if (typeof window !== 'undefined') {
            try {
                const storedValue = localStorage.getItem(key);
                return storedValue ? JSON.parse(storedValue) : initialValue;
            } catch (error) {
                console.error("Error reading persistent state:", error);
                return initialValue;
            }
        }
        return initialValue;
    });

    const updateState = React.useCallback((updates: Partial<T>) => {
        setState(prevState => {
            const newState = { ...prevState, ...updates } as T;
            if (typeof window !== 'undefined') {
                localStorage.setItem(key, JSON.stringify(newState));
            }
            return newState;
        });
    }, []);

    return [state, updateState];
}