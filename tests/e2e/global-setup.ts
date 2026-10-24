// Warms routes so `next dev` compiles them once, before parallel workers race on cold compiles.
export default async function globalSetup() {
  const base = 'http://127.0.0.1:3000';
  const paths = ['/app', '/live', '/setup', `/r/${'w'.repeat(43)}`];
  for (const path of paths) {
    try { await fetch(base + path, { signal: AbortSignal.timeout(90_000) }); } catch { /* the tests will report real failures */ }
  }
}
