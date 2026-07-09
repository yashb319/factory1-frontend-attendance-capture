import type { Settings } from "../types";

type Props = {
  settings: Settings;
  loading: boolean;
  onChange: React.Dispatch<React.SetStateAction<Settings>>;
  onRefresh: () => void;
  onUnlock?: () => void;
};

export function SettingsPanel({
  settings,
  loading,
  onChange,
  onRefresh,
  onUnlock,
}: Props) {
  const locked = Boolean(settings.locked);

  return (
    <div className="card-section settings">
      <h2>Factory Connection</h2>
      {locked ? (
        <p className="locked-note">
          This station is locked to the connected factory. Unlock before
          changing the key or device ID.
        </p>
      ) : null}

      <label>
        Backend URL
        <input
          value={settings.apiBaseUrl}
          disabled={locked}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              apiBaseUrl: event.target.value,
            }))
          }
        />
      </label>

      <label>
        Factory capture key
        <textarea
          value={settings.captureKey}
          disabled={locked}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              captureKey: event.target.value.trim(),
            }))
          }
          placeholder="Paste key from Factory1 organization settings"
        />
      </label>

      <label>
        Device ID
        <input
          value={settings.deviceId}
          disabled={locked}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              deviceId: event.target.value,
            }))
          }
        />
      </label>

      {locked ? (
        <button className="danger" onClick={onUnlock}>
          Unlock connection
        </button>
      ) : (
        <button className="primary" onClick={onRefresh} disabled={loading}>
          {loading ? "Connecting..." : "Connect factory"}
        </button>
      )}
    </div>
  );
}
