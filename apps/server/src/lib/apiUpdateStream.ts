export async function* streamWithUpdates<TUpdate, TResult, TFinal = TResult>(
  request: (onUpdate: (update: TUpdate) => void) => Promise<TResult>,
  mapResult: (result: TResult) => TFinal,
) {
  const updatesQueue: TUpdate[] = [];
  let notifyUpdate: (() => void) | null = null;

  const pushUpdate = (update: TUpdate) => {
    updatesQueue.push(update);
    if (notifyUpdate) {
      notifyUpdate();
      notifyUpdate = null;
    }
  };

  const waitForUpdate = () =>
    new Promise<void>((resolve) => {
      notifyUpdate = resolve;
    });

  const requestPromise = request(pushUpdate);

  let running = true;
  while (running) {
    if (updatesQueue.length > 0) {
      yield updatesQueue.shift()!;
      continue;
    }

    const nextEvent = await Promise.race([
      requestPromise.then((result) => ({ type: "result" as const, result })),
      waitForUpdate().then(() => ({ type: "update" as const })),
    ]);

    if (nextEvent.type === "result") {
      while (updatesQueue.length > 0) {
        yield updatesQueue.shift()!;
      }
      yield mapResult(nextEvent.result);
      running = false;
    }
  }
}
