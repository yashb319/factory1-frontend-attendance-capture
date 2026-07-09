import { useEffect, useMemo, useRef, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { ActivityPanel } from "./components/ActivityPanel";
import { EmployeeRoster } from "./components/EmployeeRoster";
import { Segmented } from "./components/Segmented";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toast } from "./components/Toast";
import { useLocalStorage } from "./hooks/useLocalStorage";
import {
  ensureFaceModels,
  faceDescriptorFromImage,
  faceDistance,
} from "./services/faceMatching";
import type {
  CaptureEmployee,
  CaptureMode,
  FactoryProfile,
  LastMatch,
  LogEntry,
  Settings,
} from "./types";
import { localDateTime, parseEmployeeCode } from "./utils/attendance";

const settingsKey = "factory1.capture.settings";

export function App() {
  const [settings, setSettings] = useLocalStorage<Settings>(settingsKey, {
    apiBaseUrl: "http://localhost:8080",
    captureKey: "",
    deviceId: "factory1-mobile-camera-1",
  });
  const [mode, setMode] = useState<CaptureMode>("QR");
  const [manualCode, setManualCode] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [employees, setEmployees] = useState<CaptureEmployee[]>([]);
  const [factory, setFactory] = useState<FactoryProfile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toast, setToast] = useState<LogEntry | null>(null);
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanLockRef = useRef(false);

  const qrSupported = Boolean(window.BarcodeDetector);
  const canPost = Boolean(settings.apiBaseUrl && settings.captureKey);
  const isConnected = Boolean(settings.locked && factory);
  const faceReadyEmployees = useMemo(
    () =>
      employees.filter((employee) => employee.photoDataUrl && employee.descriptor),
    [employees]
  );

  useEffect(() => {
    if (!isConnected) {
      stopCamera();
      setCameraReady(false);
      setScanning(false);
      return;
    }

    void startCamera();
    return () => stopCamera();
  }, [isConnected]);

  useEffect(() => {
    if (settings.apiBaseUrl && settings.captureKey) {
      void loadEmployees();
    }
  }, [settings.apiBaseUrl, settings.captureKey]);

  useEffect(() => {
    if (mode !== "QR" || !scanning || !qrSupported) return;

    let cancelled = false;
    const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });

    async function loop() {
      if (cancelled) return;
      const video = videoRef.current;

      if (video && video.readyState >= 2 && !scanLockRef.current) {
        try {
          const codes = await detector.detect(video);
          const employeeCode = codes[0]?.rawValue
            ? parseEmployeeCode(codes[0].rawValue)
            : "";

          if (employeeCode) {
            scanLockRef.current = true;
            await submitAttendance(employeeCode, 0.99, "QR scan");
            window.setTimeout(() => {
              scanLockRef.current = false;
            }, 2500);
          }
        } catch {
          pushLog(
            "error",
            "QR scan failed",
            "Use manual entry if QR scanning is unavailable."
          );
        }
      }

      window.setTimeout(loop, 500);
    }

    void loop();

    return () => {
      cancelled = true;
    };
  }, [mode, scanning, qrSupported, settings, employees]);

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
      await ensureFaceModels();
      setModelsReady(true);

      const url = `${settings.apiBaseUrl.replace(
        /\/$/,
        ""
      )}/api/public/attendance-capture/employees?key=${encodeURIComponent(
        settings.captureKey
      )}`;
      const response = await fetch(url);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const roster = payload?.data?.employees ?? [];
      const nextEmployees: CaptureEmployee[] = await Promise.all(
        roster.map(async (employee: CaptureEmployee) => {
          const descriptor = employee.photoDataUrl
            ? await faceDescriptorFromImage(employee.photoDataUrl).catch(
                () => undefined
              )
            : undefined;

          return { ...employee, descriptor };
        })
      );

      setEmployees(nextEmployees);
      setFactory({
        organizationName: payload?.data?.organizationName || "Factory",
        location: payload?.data?.location || "",
        industryType: payload?.data?.industryType || "",
        gstNumber: payload?.data?.gstNumber || "",
        state: payload?.data?.state || "",
      });
      setSettings((current) => ({ ...current, locked: true }));
      setSettingsOpen(false);
      pushLog(
        "success",
        `Loaded ${nextEmployees.length} employees`,
        `${nextEmployees.filter((employee) => employee.descriptor).length} face profiles ready`
      );
    } catch (error) {
      setEmployees([]);
      setFactory(null);
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
      pushLog(
        "error",
        "Backend URL and factory capture key are required before marking attendance."
      );
      return;
    }

    const code = employeeCode.trim();
    if (!code) {
      pushLog("error", "Employee code is required.");
      return;
    }

    try {
      const response = await fetch(
        `${settings.apiBaseUrl.replace(
          /\/$/,
          ""
        )}/api/public/attendance-capture/device-event`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            captureKey: settings.captureKey,
            employeeCode: code,
            eventTime: localDateTime(),
            eventType: "CHECK_IN",
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
    if (!faceReadyEmployees.length) {
      pushLog(
        "error",
        "No face profiles found in Factory1.",
        "Upload clear employee face photos, then refresh."
      );
      return;
    }

    await ensureFaceModels();
    setModelsReady(true);

    const photoDataUrl = captureFrame();
    if (!photoDataUrl) return;

    const descriptor = await faceDescriptorFromImage(photoDataUrl).catch(
      () => null
    );
    if (!descriptor) {
      pushLog("error", "No face detected", "Face the camera clearly and try again.");
      return;
    }

    const candidates = faceReadyEmployees
      .map((employee) => ({
        ...employee,
        distance: faceDistance(descriptor, employee.descriptor!),
      }))
      .sort((a, b) => a.distance - b.distance);

    const best = candidates[0];
    const confidence = Math.max(0, Math.min(1, 1 - best.distance / 0.6));
    setLastMatch({
      employeeCode: best.employeeCode,
      distance: best.distance,
      confidence,
    });

    if (best.distance > 0.5) {
      pushLog(
        "error",
        "No confident photo match",
        `Closest: ${best.employeeCode}, distance ${best.distance.toFixed(2)}. Use QR/manual or upload a clearer employee photo.`
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

    setLogs((current) => [entry, ...current].slice(0, 12));

    if (type === "success" || type === "error") {
      setToast(entry);
      window.setTimeout(() => {
        setToast((current) => (current?.id === entry.id ? null : current));
      }, 3200);
    }
  }

  function unlockFactory() {
    setSettings((current) => ({ ...current, locked: false }));
    setFactory(null);
    setEmployees([]);
    setSettingsOpen(true);
    pushLog("info", "Factory connection unlocked");
  }

  return (
    <main className="app-shell">
      <Toast toast={toast} />

      {!isConnected ? (
        <SetupView
          settings={settings}
          loadingEmployees={loadingEmployees}
          setSettings={setSettings}
          loadEmployees={loadEmployees}
        />
      ) : (
        <>
          <FactoryHeader
            factory={factory}
            cameraReady={cameraReady}
            onToggleSettings={() => setSettingsOpen((value) => !value)}
          />

          {settingsOpen ? (
            <section className="settings-drawer">
              <SettingsPanel
                settings={settings}
                onChange={setSettings}
                onRefresh={loadEmployees}
                loading={loadingEmployees}
                onUnlock={unlockFactory}
              />
            </section>
          ) : null}

          <section className="capture-grid">
            <div className="capture-main">
              <CameraPanel videoRef={videoRef} canvasRef={canvasRef} />
              <CaptureControls
                mode={mode}
                setMode={setMode}
                qrSupported={qrSupported}
                scanning={scanning}
                setScanning={setScanning}
                loadingEmployees={loadingEmployees}
                modelsReady={modelsReady}
                manualCode={manualCode}
                setManualCode={setManualCode}
                lastMatch={lastMatch}
                loadEmployees={loadEmployees}
                matchCurrentPhoto={matchCurrentPhoto}
                submitManual={() =>
                  submitAttendance(manualCode, 1, "Manual fallback")
                }
              />
            </div>

            <ActivityPanel logs={logs} onClear={() => setLogs([])} />
          </section>

          <EmployeeRoster
            employees={employees}
            readyCount={faceReadyEmployees.length}
          />
        </>
      )}
    </main>
  );
}

type SetupViewProps = {
  settings: Settings;
  loadingEmployees: boolean;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  loadEmployees: () => void;
};

function SetupView({
  settings,
  loadingEmployees,
  setSettings,
  loadEmployees,
}: SetupViewProps) {
  return (
    <>
      <section className="hero setup-hero">
        <div>
          <p className="eyebrow">Factory1 Capture Station</p>
          <h1>Connect factory</h1>
          <p>
            Paste the Attendance Capture Key from Factory1 Organization
            Settings. Once connected, this device locks to that factory until
            you unlock it.
          </p>
        </div>
        <div className="status-pill offline">Setup required</div>
      </section>

      <section className="setup-grid">
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onRefresh={loadEmployees}
          loading={loadingEmployees}
        />
        <div className="panel setup-help">
          <h2>Before you scan</h2>
          <p>
            Generate the capture key inside Factory1, upload employee photos if
            you want photo matching, and print employee QR codes from the
            Employees page.
          </p>
          <p>
            After pairing, every scan records one punch. Employees can go in and
            out any number of times in a day.
          </p>
        </div>
      </section>
    </>
  );
}

type FactoryHeaderProps = {
  factory: FactoryProfile | null;
  cameraReady: boolean;
  onToggleSettings: () => void;
};

function FactoryHeader({
  factory,
  cameraReady,
  onToggleSettings,
}: FactoryHeaderProps) {
  return (
    <section className="hero factory-hero">
      <div>
        <p className="eyebrow">Factory1 Capture Station</p>
        <h1>{factory?.organizationName || "Factory"}</h1>
        <div className="factory-meta">
          {factory?.location ? <span>{factory.location}</span> : null}
          {factory?.state ? <span>{factory.state}</span> : null}
          {factory?.industryType ? <span>{factory.industryType}</span> : null}
          {factory?.gstNumber ? <span>GST {factory.gstNumber}</span> : null}
        </div>
      </div>
      <div className="hero-actions">
        <div className="status-pill">
          {cameraReady ? "Camera online" : "Camera offline"}
        </div>
        <button
          className="icon-button"
          onClick={onToggleSettings}
          title="Capture settings"
          aria-label="Capture settings"
        >
          <SettingsIcon size={20} strokeWidth={2.25} />
        </button>
      </div>
    </section>
  );
}

type CameraPanelProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

function CameraPanel({ videoRef, canvasRef }: CameraPanelProps) {
  return (
    <div className="camera-panel">
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} hidden />
      <div className="camera-overlay">
        <div className="scan-box" />
      </div>
    </div>
  );
}

type CaptureControlsProps = {
  mode: CaptureMode;
  setMode: (mode: CaptureMode) => void;
  qrSupported: boolean;
  scanning: boolean;
  setScanning: React.Dispatch<React.SetStateAction<boolean>>;
  loadingEmployees: boolean;
  modelsReady: boolean;
  manualCode: string;
  setManualCode: React.Dispatch<React.SetStateAction<string>>;
  lastMatch: LastMatch | null;
  loadEmployees: () => void;
  matchCurrentPhoto: () => void;
  submitManual: () => void;
};

function CaptureControls({
  mode,
  setMode,
  qrSupported,
  scanning,
  setScanning,
  loadingEmployees,
  modelsReady,
  manualCode,
  setManualCode,
  lastMatch,
  loadEmployees,
  matchCurrentPhoto,
  submitManual,
}: CaptureControlsProps) {
  return (
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

      {mode === "QR" ? (
        <div className="card-section">
          <h2>QR Scan</h2>
          <p>
            Every scan toggles the next punch automatically: check-in,
            check-out, check-in again, and so on.
          </p>
          {!qrSupported ? (
            <p className="warning">
              This browser does not support BarcodeDetector. Use Manual mode.
            </p>
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
            Employee photos are converted into local face profiles using
            face-api.js.
            {modelsReady ? " Model ready." : " Model loads when you connect."}
          </p>
          <div className="button-row">
            <button onClick={loadEmployees} disabled={loadingEmployees}>
              {loadingEmployees ? "Refreshing..." : "Refresh faces"}
            </button>
            <button className="primary" onClick={matchCurrentPhoto}>
              Match and mark
            </button>
          </div>
          {lastMatch ? (
            <div className="match-box">
              Closest: {lastMatch.employeeCode} · confidence{" "}
              {Math.round(lastMatch.confidence * 100)}% · distance{" "}
              {lastMatch.distance.toFixed(2)}
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
          <button className="primary" onClick={submitManual}>
            Mark punch
          </button>
        </div>
      ) : null}
    </div>
  );
}
