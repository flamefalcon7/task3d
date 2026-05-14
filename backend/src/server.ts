import { serve } from '@hono/node-server';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: buildApp().fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`backend listening on http://localhost:${info.port}`);
});
