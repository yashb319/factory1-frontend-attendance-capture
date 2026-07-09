export function parseEmployeeCode(raw: string) {
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

export function localDateTime() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
    now.getSeconds()
  )}`;
}
