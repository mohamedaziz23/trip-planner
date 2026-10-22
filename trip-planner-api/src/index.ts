import { env } from './config/env';
import { connectDb } from './config/db';
import { createApp } from './app';

async function main() {
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
