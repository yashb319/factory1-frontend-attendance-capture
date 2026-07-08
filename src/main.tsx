import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type CaptureMode = "QR" | "PHOTO" | "MANUAL";
type EventType = "CHECK_IN" | "CHECK_OUT";

type Settings = {
  apiBaseUrl: string;
  captureKey: string;
  deviceId: string;
};

type CaptureEmployee = {
  employeeCode: string;
  name: string;
  photoDataUrl?: string;
  hash?: string;
};

type LogEntry = {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  detail?: string;
  at: string;
};

const settingsKey = "factory1.capture.settings";

function App() {
  const [settings, setSettings] = useLocalStorage<Settings>(settingsKey, {
    apiBaseUrl: "http://localhost:8080",
    captureKey: "",
    deviceId: "factory1-mobile-camera-1",
  });
  const [mode, setMode] = useState<CaptureMode>("QR");
  const [eventType, setEventType] = useState<EventType>("CHECK_IN");
  const [manualCode, setManualCode] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [employees, setEmployees] = useState<CaptureEmployee[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toast, setToast] = useState<LogEntry | null>(null);
  const [lastMatch, setLastMatch] = useState<{
    employeeCode: string;
    distance: number;
    confidence: number;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanLockRef = useRef(false);

  const qrSupported = Boolean(window.BarcodeDetector);
  const canPost = Boolean(settings.apiBaseUrl && settings.captureKey);
  const employeesWithPhotos = useMemo(
    () => employees.filter((employee) => employee.photoDataUrl && employee.hash),
    [employees]
  );

  useEffect(() => {
    void startCamera();

    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (settings.apiBaseUrl && settings.captureKey) {
      void loadEmployees();
    }
  }, [settings.apiBaseUrl, settings.captureKey]);

  useEffect(() => {
    if (mode !== "QR" || !scanning || !qrSupported) {
      return;
    }

    let cancelled = false;
    const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });

    async function loop() {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !scanLockRef.current) {
        try {
          const codes = await detector.detect(video);
          const raw = codes[0]?.rawValue;
          const employeeCode = raw ? parseEmployeeCode(raw) : "";

          if (employeeCode) {
            scanLockRef.current = true;
            await submitAttendance(employeeCode, 0.99, "QR scan");
            window.setTimeout(() => {
              scanLockRef.current = false;
            }, 2500);
          }
        } catch {
          pushLog("error", "QR scan failed", "Use manual entry if QR scanning is unavailable.");
        }
      }
      window.setTimeout(loop, 500);
    }

    void loop();

    return () => {
      cancelled = true;
    };
  }, [mode, scanning, qrSupported, settings, eventType]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
      setScanning(true);
      pushLog("info", "Camera ready");
    } catch (error) {
      setCameraReady(false);
      pushLog("error", "Could not open camera", String(error));
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
  }

  async function loadEmployees() {
    if (!canPost) {
      pushLog("error", "Backend URL and factory capture key are required.");
      return;
    }

    setLoadingEmployees(true);
    try {
      const url = `${settings.apiBaseUrl.replace(/\/$/, "")}/api/public/attendance-capture/employees?key=${encodeURIComponent(settings.captureKey)}`;
      const response = await fetch(url);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const roster = payload?.data?.employees ?? [];
      const nextEmployees: CaptureEmployee[] = await Promise.all(
        roster.map(async (employee: CaptureEmployee) => ({
          ...employee,
          hash: employee.photoDataUrl ? await imageHash(employee.photoDataUrl) : undefined,
        }))
      );

      setEmployees(nextEmployees);
      setOrganizationName(payload?.data?.organizationName || "");
      pushLog("success", `Loaded ${nextEmployees.length} employees`, `${nextEmployees.filter((employee) => employee.photoDataUrl).length} with photos`);
    } catch (error) {
      setEmployees([]);
      pushLog("error", "Could not load factory employees", String(error));
    } finally {
      setLoadingEmployees(false);
    }
  }

  async function submitAttendance(
    employeeCode: string,
    confidence: number,
    source: string
  ) {
    if (!canPost) {
      pushLog("error", "Backend URL and factory capture key are required before marking attendance.");
      return;
    }

    const code = employeeCode.trim();
    if (!code) {
      pushLog("error", "Employee code is required.");
      return;
    }

    try {
      const response = await fetch(
        `${settings.apiBaseUrl.replace(/\/$/, "")}/api/public/attendance-capture/device-event`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            captureKey: settings.captureKey,
            employeeCode: code,
            eventTime: localDateTime(),
            eventType,
            deviceId: settings.deviceId,
            confidence,
          }),
        }
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const punchType =
        payload?.data?.lastPunchType === "CHECK_OUT" ? "Check-out" : "Check-in";
      const employeeName =
        employees.find((employee) => employee.employeeCode === code)?.name || code;

      pushLog(
        "success",
        `${punchType} marked for ${employeeName}`,
        `${source} · ${Math.round(confidence * 100)}% confidence`
      );
      setManualCode("");
    } catch (error) {
      pushLog("error", `Could not mark attendance for ${code}`, String(error));
    }
  }

  async function matchCurrentPhoto() {
    if (!employeesWithPhotos.length) {
      pushLog("error", "No employee photos found in Factory1.", "Upload photos in Factory1 employee records, then refresh.");
      return;
    }

    const photoDataUrl = captureFrame();
    if (!photoDataUrl) return;

    const hash = await imageHash(photoDataUrl);
    const candidates = employeesWithPhotos
      .map((entry) => ({
        ...entry,
        distance: hammingDistance(hash, entry.hash || ""),
      }))
      .sort((a, b) => a.distance - b.distance);

    const best = candidates[0];
    const confidence = Math.max(0, 1 - best.distance / 64);
    setLastMatch({
      employeeCode: best.employeeCode,
      distance: best.distance,
      confidence,
    });

    if (best.distance > 14) {
      pushLog(
        "error",
        "No confident photo match",
        `Closest: ${best.employeeCode}, distance ${best.distance}. Use QR/manual or upload a clearer employee photo.`
      );
      return;
    }

    await submitAttendance(best.employeeCode, confidence, "Factory1 photo match");
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      pushLog("error", "Camera frame is not ready.");
      return "";
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function pushLog(type: LogEntry["type"], message: string, detail?: string) {
    const entry = {
      id: crypto.randomUUID(),
      type,
      message,
      detail,
      at: new Date().toLocaleTimeString(),
    };

    setLogs((current) => [
      entry,
      ...current,
    ].slice(0, 12));

    if (type === "success" || type === "error") {
      setToast(entry);
      window.setTimeout(() => {
        setToast((current) => current?.id === entry.id ? null : current);
      }, 3200);
    }
  }

  return (
    <main className="app-shell">
      {toast ? (
        <div className={`toast ${toast.type}`}>
          <strong>{toast.message}</strong>
          {toast.detail ? <span>{toast.detail}</span> : null}
        </div>
      ) : null}
      <section className="hero">
        <div>
          <p className="eyebrow">Factory1 Capture Station</p>
          <h1>Automatic Attendance</h1>
          <p>
            Enter the factory capture key from Factory1 settings, then mark attendance
            through employee QR, Factory1 employee photos, or manual fallback.
          </p>
        </div>
        <div className="status-pill">{cameraReady ? "Camera online" : "Camera offline"}</div>
      </section>

      <section className="layout">
        <div className="camera-panel">
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} hidden />
          <div className="camera-overlay">
            <div className="scan-box" />
          </div>
        </div>

        <div className="control-panel">
          <Segmented
            value={mode}
            options={[
              ["QR", "QR"],
              ["PHOTO", "Photo"],
              ["MANUAL", "Manual"],
            ]}
            onChange={(value) => setMode(value as CaptureMode)}
          />

          <label>
            Event
            <select value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}>
              <option value="CHECK_IN">Auto in/out</option>
            </select>
          </label>

          {mode === "QR" ? (
            <div className="card-section">
              <h2>QR Scan</h2>
              <p>
                Generate employee QR codes from Factory1 Employees. Every scan toggles check-in and check-out automatically.
              </p>
              {!qrSupported ? (
                <p className="warning">This browser does not support BarcodeDetector. Use Manual mode.</p>
              ) : null}
              <button onClick={() => setScanning((value) => !value)}>
                {scanning ? "Pause scanner" : "Start scanner"}
              </button>
            </div>
          ) : null}

          {mode === "PHOTO" ? (
            <div className="card-section">
              <h2>Factory1 Photo Match</h2>
              <p>
                Employee photos are loaded from Factory1. This is prototype matching for pilot testing.
              </p>
              <div className="button-row">
                <button onClick={loadEmployees} disabled={loadingEmployees}>
                  {loadingEmployees ? "Refreshing..." : "Refresh photos"}
                </button>
                <button className="primary" onClick={matchCurrentPhoto}>Match and mark</button>
              </div>
              {lastMatch ? (
                <div className="match-box">
                  Closest: {lastMatch.employeeCode} · confidence{" "}
                  {Math.round(lastMatch.confidence * 100)}% · distance {lastMatch.distance}
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "MANUAL" ? (
            <div className="card-section">
              <h2>Manual Fallback</h2>
              <input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Employee code"
              />
              <button
                className="primary"
                onClick={() => submitAttendance(manualCode, 1, "Manual fallback")}
              >
                Mark attendance
              </button>
            </div>
          ) : null}

          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            onRefresh={loadEmployees}
            loading={loadingEmployees}
          />
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel">
          <div className="panel-title">
            <h2>{organizationName || "Factory Employees"}</h2>
            <span>{employees.length}</span>
          </div>
          <div className="enrollment-list">
            {employees.map((entry) => (
              <div key={entry.employeeCode} className="enrollment-card">
                {entry.photoDataUrl ? (
                  <img src={entry.photoDataUrl} alt={entry.employeeCode} />
                ) : (
                  <div className="photo-placeholder">{entry.employeeCode.slice(0, 2)}</div>
                )}
                <div>
                  <strong>{entry.employeeCode}</strong>
                  <span>{entry.name || "No name"}</span>
                </div>
              </div>
            ))}
            {!employees.length ? <p className="muted">Add the capture key and refresh employees.</p> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <h2>Activity</h2>
            <button className="ghost" onClick={() => setLogs([])}>Clear</button>
          </div>
          <div className="log-list">
            {logs.map((log) => (
              <div key={log.id} className={`log-entry ${log.type}`}>
                <div>
                  <strong>{log.message}</strong>
                  {log.detail ? <span>{log.detail}</span> : null}
                </div>
                <time>{log.at}</time>
              </div>
            ))}
            {!logs.length ? <p className="muted">No events yet.</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function SettingsPanel({
  settings,
  onChange,
  onRefresh,
  loading,
}: {
  settings: Settings;
  onChange: React.Dispatch<React.SetStateAction<Settings>>;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="card-section settings">
      <h2>Factory Connection</h2>
      <label>
        Backend URL
        <input
          value={settings.apiBaseUrl}
          onChange={(event) =>
            onChange((current) => ({ ...current, apiBaseUrl: event.target.value }))
          }
        />
      </label>
      <label>
        Factory capture key
        <textarea
          value={settings.captureKey}
          onChange={(event) =>
            onChange((current) => ({ ...current, captureKey: event.target.value.trim() }))
          }
          placeholder="Paste key from Factory1 organization settings"
        />
      </label>
      <label>
        Device ID
        <input
          value={settings.deviceId}
          onChange={(event) =>
            onChange((current) => ({ ...current, deviceId: event.target.value }))
          }
        />
      </label>
      <button className="primary" onClick={onRefresh} disabled={loading}>
        {loading ? "Connecting..." : "Connect factory"}
      </button>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          className={value === optionValue ? "active" : ""}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function parseEmployeeCode(raw: string) {
  const trimmed = raw.trim();
  try {
    const json = JSON.parse(trimmed);
    if (json.employeeCode) return String(json.employeeCode).trim();
  } catch {
    // Fall through to URL/plain text parsing.
  }

  try {
    const url = new URL(trimmed);
    return (
      url.searchParams.get("employeeCode") ||
      url.searchParams.get("employee") ||
      url.searchParams.get("code") ||
      ""
    ).trim();
  } catch {
    return trimmed;
  }
}

function localDateTime() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function imageHash(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(image, 0, 0, 8, 8);
  const { data } = context.getImageData(0, 0, 8, 8);
  const grayscale: number[] = [];
  for (let index = 0; index < data.length; index += 4) {
    grayscale.push(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }
  const average = grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;
  return grayscale.map((value) => (value >= average ? "1" : "0")).join("");
}

function hammingDistance(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = window.localStorage.getItem(key);
    if (!stored) return initialValue;

    const parsed = JSON.parse(stored) as Partial<Settings> & { token?: string };
    if ("token" in parsed && !("captureKey" in parsed)) {
      return {
        ...initialValue,
        apiBaseUrl: parsed.apiBaseUrl || (initialValue as Settings).apiBaseUrl,
        deviceId: parsed.deviceId || (initialValue as Settings).deviceId,
      } as T;
    }
    return parsed as T;
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
