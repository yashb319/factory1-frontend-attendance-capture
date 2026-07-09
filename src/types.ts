export type CaptureMode = "QR" | "PHOTO" | "MANUAL";
export type EventType = "CHECK_IN" | "CHECK_OUT";

export type Settings = {
  apiBaseUrl: string;
  captureKey: string;
  deviceId: string;
  locked?: boolean;
};

export type CaptureEmployee = {
  employeeCode: string;
  name: string;
  photoDataUrl?: string;
  descriptor?: Float32Array;
};

export type FactoryProfile = {
  organizationName: string;
  location?: string;
  industryType?: string;
  gstNumber?: string;
  state?: string;
};

export type LogEntry = {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  detail?: string;
  at: string;
};

export type LastMatch = {
  employeeCode: string;
  distance: number;
  confidence: number;
};
