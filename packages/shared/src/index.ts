export interface HealthResponse {
  status: "ok";
  timestamp: number;
}

export interface DeviceState {
  id: string;
  name: string;
  type: string;
  isOn: boolean;
  brightness?: number;
  temperature?: number;
}
