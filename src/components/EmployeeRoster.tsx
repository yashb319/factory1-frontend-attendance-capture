import { useState } from "react";
import type { CaptureEmployee } from "../types";

type Props = {
  employees: CaptureEmployee[];
  readyCount: number;
};

export function EmployeeRoster({ employees, readyCount }: Props) {
  return (
    <section className="panel employee-panel">
      <div className="panel-title">
        <h2>Factory Employees</h2>
        <span>
          {readyCount}/{employees.length}
        </span>
      </div>
      <div className="enrollment-list roster-grid">
        {employees.map((entry) => (
          <div key={entry.employeeCode} className="enrollment-card">
            <EmployeePhoto
              src={entry.photoDataUrl}
              employeeCode={entry.employeeCode}
            />
            <div>
              <strong>{entry.employeeCode}</strong>
              <span>{entry.descriptor ? "Face ready" : "No face profile"}</span>
            </div>
          </div>
        ))}
        {!employees.length ? <p className="muted">No active employees found.</p> : null}
      </div>
    </section>
  );
}

type EmployeePhotoProps = {
  src?: string;
  employeeCode: string;
};

function EmployeePhoto({ src, employeeCode }: EmployeePhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string>();

  if (!shouldShowEmployeePhoto(src, failedSrc)) {
    return (
      <div
        className="photo-placeholder"
        aria-label={`${employeeCode} photo unavailable`}
      >
        {employeeCode.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={employeeCode}
      onError={() => setFailedSrc(src)}
    />
  );
}

export function shouldShowEmployeePhoto(src?: string, failedSrc?: string) {
  return Boolean(src && src !== failedSrc);
}
