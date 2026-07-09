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
            {entry.photoDataUrl ? (
              <img src={entry.photoDataUrl} alt={entry.employeeCode} />
            ) : (
              <div className="photo-placeholder">
                {entry.employeeCode.slice(0, 2)}
              </div>
            )}
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
