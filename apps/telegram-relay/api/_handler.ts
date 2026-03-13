import type { IncomingMessage, ServerResponse } from "node:http";

import { buildRelayApp } from "../src/app.js";

let appPromise: ReturnType<typeof buildRelayApp> | null = null;

async function getApp() {
  appPromise ??= buildRelayApp();

  const app = await appPromise;
  await app.ready();
  return app;
}

function normalizeVercelPath(req: IncomingMessage) {
  if (!req.url) return;

  if (req.url === "/api") {
    req.url = "/";
    return;
  }

  if (req.url.startsWith("/api/")) {
    req.url = req.url.slice(4);
  }
}

export async function relayHandler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    normalizeVercelPath(req);
    app.server.emit("request", req, res);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start relay app";
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: message }));
  }
}
