import type { LogEntry } from "../types";

type Props = {
  toast: LogEntry | null;
};

export function Toast({ toast }: Props) {
  if (!toast) return null;

  return (
    <div className={`toast ${toast.type}`}>
      <strong>{toast.message}</strong>
      {toast.detail ? <span>{toast.detail}</span> : null}
    </div>
  );
}
