import { useLaunchParams, useRawInitData } from "@tma.js/sdk-react";

export function useAuth() {
  // TODO: Add additional auth methods
  try {
    return {info: useLaunchParams(), token: "tma " + useRawInitData()};
  } catch {
    return {parsed: null, raw: null};
  }
}

