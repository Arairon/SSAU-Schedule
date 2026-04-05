import { getBrowser } from "@/lib/browser";
import log from "@/logger";

type ScrapedRequest = { headers: Record<string, string> };
export async function scrapeLoginRequest(): Promise<ScrapedRequest | null> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  let result: ScrapedRequest | null = null;
  log.debug("Starting to scrape login request", { user: "browser" });
  try {
    await page.goto("https://lk.ssau.ru/account/login", {
      waitUntil: "networkidle2",
    });

    page.on("request", (request) => {
      if (
        request.url().includes("/account/login") &&
        request.method() === "POST"
      ) {
        log.debug("Request successfully caught", { user: "browser" });
        result = {
          headers: request.headers(),
        };
      }
    });

    await page.evaluate(() => {
      const button = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button[type='submit']"),
      ).find((element) => element.textContent?.includes("Войти"));

      if (!button) {
        throw new Error("Login button not found on the page");
      }

      button.click();
    });

    await page.waitForNetworkIdle({ idleTime: 100, timeout: 1000 });
    return result;
  } finally {
    await page.close();
    if (!result) {
      log.warn("Failed to scrape login request", { user: "browser" });
    }
  }
}
