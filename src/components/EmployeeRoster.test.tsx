import { describe, expect, it } from "vitest";
import { shouldShowEmployeePhoto } from "./EmployeeRoster";

describe("shouldShowEmployeePhoto", () => {
  it("falls back after a URL fails and retries when the URL is refreshed", () => {
    const expiredUrl = "https://objects.example.com/expired.jpg";
    const refreshedUrl = "https://objects.example.com/refreshed.jpg";

    expect(shouldShowEmployeePhoto(expiredUrl)).toBe(true);
    expect(shouldShowEmployeePhoto(expiredUrl, expiredUrl)).toBe(false);
    expect(shouldShowEmployeePhoto(refreshedUrl, expiredUrl)).toBe(true);
    expect(shouldShowEmployeePhoto(undefined, expiredUrl)).toBe(false);
  });
});
