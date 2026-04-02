import { Buffer } from 'buffer';

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return;

  const win = window as Window & {
    Buffer?: typeof Buffer;
    process?: { env?: Record<string, string> };
  };

  if (!win.Buffer) {
    win.Buffer = Buffer;
  }
  if (!win.process) {
    win.process = { env: {} };
  } else if (!win.process.env) {
    win.process.env = {};
  }
});
