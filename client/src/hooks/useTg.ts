import { useLaunchParams, useRawInitData } from "@tma.js/sdk-react";

export function useTg() {
  try {
    return {parsed: useLaunchParams(), raw: useRawInitData()};
  } catch {
    return {parsed: null, raw: null};
  }
}

