import { env } from './config/env';
import { connectDb } from './config/db';
import { createApp } from './app';

/** The MongoDB driver needs the global Web Crypto API (Node 20+). */
function assertNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20 && globalThis.crypto) return;
  console.error(
    `[api] Node ${process.version} (${process.execPath}) is too old: Node 20 or later is required.\n` +
      '      A "node" npm package in a parent folder (e.g. C:\\Users\\<you>\\node_modules) can shadow the\n' +
      '      installed Node when running `npm run`. Remove it, or start the API with `node --watch --import tsx src/index.ts`.',
  );
  process.exit(1);
}

async function main() {
  assertNodeVersion();
  await connectDb();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}/api/v1 (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error('[api] failed to start', err);
  process.exit(1);
});
