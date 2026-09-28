// Postgres local descartavel (embedded-postgres). Sem Docker.
//   node dev-env/pg.mjs start   -> inicializa (se preciso) e mantem rodando em foreground
//   node dev-env/pg.mjs reset   -> apaga o diretorio de dados local
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const cfg = require('./config.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'data');
const action = process.argv[2] || 'start';

if (action === 'reset') {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('[dev-env] dados locais removidos:', dataDir);
  process.exit(0);
}

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: cfg.DB_USER,
  password: cfg.DB_PASS,
  port: cfg.DB_PORT,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error(String(e).slice(0, 500)),
});

const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase(cfg.DB_NAME);
console.log(`[dev-env] Postgres local pronto em 127.0.0.1:${cfg.DB_PORT}/${cfg.DB_NAME} (Ctrl+C para parar)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
