import { initializeDiscordRollDelivery, processNextDiscordRoll } from '../handlers/DiscordRollDelivery.handler';

let timer: NodeJS.Timeout | undefined;
let starting: Promise<void> | undefined;
let stopped = false;
export function discordRollWorkerRunning() { return Boolean(timer) && !stopped; }

export function stopDiscordRollWorker() { stopped = true; if (timer) clearInterval(timer); timer = undefined; }

export function startDiscordRollWorker(): Promise<void> {
  if (starting) return starting;
  stopped = false;
  starting = initializeDiscordRollDelivery().then(() => {
    if (stopped) return;
    let busy = false;
    timer = setInterval(() => {
      if (busy || stopped) return;
      busy = true;
      void processNextDiscordRoll().catch(() => console.warn('[Discord rolls] Delivery check failed; durable work will be checked again.')).finally(() => { busy = false; });
    }, 2000);
    timer.unref();
  });
  return starting;
}
