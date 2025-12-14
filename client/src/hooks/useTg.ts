import { useLaunchParams } from "@tma.js/sdk-react";

export function useTg() {
  try {
    return useLaunchParams();
  } catch {
    return false;
  }
}
