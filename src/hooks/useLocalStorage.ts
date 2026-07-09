import { useEffect, useState } from "react";
import type { Settings } from "../types";

export function useLocalStorage<T>(
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
