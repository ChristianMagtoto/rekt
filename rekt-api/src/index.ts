import 'dotenv/config';
import Fastify from 'fastify';
import authenticatePlugin from './shared/security/authenticate.js';
import authRoutes from './modules/auth/routes.js';

const app = Fastify({ logger: true });

await app.register(authenticatePlugin);
await app.register(authRoutes);

app.get('/health', async () => ({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3000);
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`REKT API listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
