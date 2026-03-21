import { env } from "@/env";
import log from "@/logger";
import type { Browser } from "puppeteer";
import Puppeteer from "puppeteer";

export let browser: Browser | null = null;
export let browserPromise: Promise<Browser> | null = null;

export function resetBrowserState() {
  browser = null;
  browserPromise = null;
}

export function shouldRetryBrowserOperation(error: unknown) {
  const message = String(error);
  return (
    message.includes("Target closed") ||
    message.includes("Session closed") ||
    message.includes("Protocol error") ||
    message.includes("Connection closed")
  );
}

export async function getBrowser() {
  if (browser?.connected) {
    return browser;
  }

  browserPromise ??= Puppeteer.launch({
    executablePath: env.SCHED_SERVER_CHROME_PATH ?? "chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-software-rasterizer",
    ],
    protocolTimeout: 30_000,
  })
    .then((instance) => {
      browser = instance;
      instance.on("disconnected", resetBrowserState);
      return instance;
    })
    .catch((error) => {
      resetBrowserState();
      log.error(`Puppeteer launch failed: ${String(error)}`, { user: "sys" });
      throw error;
    });

  return browserPromise;
}
