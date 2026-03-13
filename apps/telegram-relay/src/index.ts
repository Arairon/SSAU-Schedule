import { env } from "./env.js";
import { buildRelayApp } from "./app.js";

async function start() {
  const server = await buildRelayApp();

  await server.listen({
    host: env.RELAY_HOST,
    port: env.RELAY_PORT,
  });
}

void start().catch((error) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unable to start telegram relay app";
  console.error("[telegram-relay]", message);
  process.exit(1);
});
