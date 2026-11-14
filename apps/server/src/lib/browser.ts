import { env } from "@/server/env"
import log from "@/server/logger"
import type { Browser } from "puppeteer"
import Puppeteer from "puppeteer"

export let browser: Browser | null = null
export let browserPromise: Promise<Browser> | null = null

export function resetBrowserState() {
  browser = null
  browserPromise = null
}

export function shouldRetryBrowserOperation(error: unknown) {
  const message = String(error)
  return (
    message.includes("Target closed") ||
    message.includes("Session closed") ||
    message.includes("Protocol error") ||
    message.includes("Connection closed")
  )
}

export async function getBrowser() {
  if (browser?.connected) {
    return browser
  }

  const launchArgs = {
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-software-rasterizer",
    ]
  }

  if (env.SCHED_SERVER_BROWSERLESS_URL) {
    const url = new URL(env.SCHED_SERVER_BROWSERLESS_URL)
    if (url.searchParams.has("launch")) {
      log.warn("Chrome launch params are overriden", {
        object: {
          old: url.searchParams.toJSON(),
          new: launchArgs
        }
      })
    }
    url.searchParams.append("launch", encodeURIComponent(JSON.stringify(launchArgs)))
    browserPromise ??= Puppeteer.connect({
      browserWSEndpoint: env.SCHED_SERVER_BROWSERLESS_URL,
      protocolTimeout: 30_000,
    })
      .then((instance) => {
        browser = instance
        instance.on("disconnected", resetBrowserState)
        return instance
      })
      .catch((error) => {
        resetBrowserState()
        log.error(`Puppeteer connection failed:`, { user: "sys", object: error })
        throw error
      })
  } else {
    browserPromise ??= Puppeteer.launch({
      browserWSEndpoint: env.SCHED_SERVER_BROWSERLESS_URL,
      executablePath:
        env.SCHED_SERVER_CHROME_PATH ?? undefined,
      args: launchArgs.args,
      protocolTimeout: 30_000,
    })
      .then((instance) => {
        browser = instance
        instance.on("disconnected", resetBrowserState)
        return instance
      })
      .catch((error) => {
        resetBrowserState()
        log.error(`Puppeteer launch failed:`, { user: "sys", object: error })
        throw error
      })
  }

  return browserPromise
}

getBrowser().then(() => {
  log.debug("Browser connection is ok", { user: "puppeteer" })
})
