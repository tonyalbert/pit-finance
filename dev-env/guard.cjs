// Salvaguarda: aborta (exit 1) se a DATABASE_URL efetiva nao for local ou contiver o host de producao.
// Uso: node dev-env/guard.cjs            -> checa a URL efetiva (shell > pit-finance/.env)
//      require('./guard.cjs').assertLocal(url)
const fs = require('fs');
const path = require('path');

const PROD_HOSTS = ['147.93.70.133', '207.180.222.79'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

function assertLocal(url) {
  if (!url) throw new Error('GUARD: DATABASE_URL vazia/indefinida.');
  if (PROD_HOSTS.some((h) => url.includes(h))) {
    throw new Error('GUARD: DATABASE_URL aponta para o host de PRODUCAO. Abortado.');
  }
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('GUARD: DATABASE_URL invalida.');
  }
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(`GUARD: host "${host}" nao e local. Abortado.`);
  }
  return host;
}

// Mesma precedencia do dotenv/ConfigModule: variavel de shell vence o arquivo .env.
function effectiveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return undefined;
  const m = fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL=(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

module.exports = { assertLocal, effectiveUrl };

if (require.main === module) {
  try {
    const host = assertLocal(effectiveUrl());
    console.log(`GUARD OK: DATABASE_URL efetiva aponta para host local (${host}).`);
  } catch (e) {
    console.error(e.message);
    console.error('Use: npm run dev:<comando> (injeta DATABASE_URL local) ou defina DATABASE_URL local no shell.');
    process.exit(1);
  }
}
