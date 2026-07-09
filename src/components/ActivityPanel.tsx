import type { LogEntry } from "../types";

type Props = {
  logs: LogEntry[];
  onClear: () => void;
};

export function ActivityPanel({ logs, onClear }: Props) {
  return (
    <div className="panel activity-panel">
      <div className="panel-title">
        <h2>Activity</h2>
        <button className="ghost" onClick={onClear}>
          Clear
        </button>
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
  );
}
