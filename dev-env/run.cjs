// Executa um comando com o ambiente LOCAL injetado (DATABASE_URL local, porta dev, sem SMTP/AI reais).
// Variaveis de shell tem precedencia sobre pit-finance/.env (dotenv nao sobrescreve), entao o .env de
// producao NUNCA e usado para DATABASE_URL, e SMTP/GROQ ficam vazios. Uso: node dev-env/run.cjs <cmd> [args]
const { spawn } = require('child_process');
const { assertLocal } = require('./guard.cjs');
const cfg = require('./config.cjs');

const fs = require('fs');
const path = require('path');

// Segredos SO de dev (ex.: chave abc_dev_ da AbacatePay) em dev-env/.env.local (ignorado pelo git).
function readLocalSecrets() {
  const file = path.join(__dirname, '.env.local');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const local = readLocalSecrets();
if (local.ABACATEPAY_API_KEY && !local.ABACATEPAY_API_KEY.startsWith('abc_dev_')) {
  console.error('[dev-env] ABACATEPAY_API_KEY de dev deve comecar com abc_dev_ (nunca use a de producao aqui).');
  process.exit(1);
}

const front = process.env.DEV_FRONT_URL || 'http://localhost:3001';
const env = {
  ...process.env,
  DATABASE_URL: cfg.DATABASE_URL,
  PORT: String(cfg.API_PORT),
  JWT_SECRET: 'dev-only-jwt-secret-not-for-prod',
  JWT_EXPIRES_IN: '7d',
  FRONTEND_URL: front,
  GROQ_API_KEY: '',
  MAIL_HOST: '',
  MAIL_PORT: '',
  MAIL_USER: '',
  MAIL_PASS: '',
  MAIL_FROM_NAME: 'PIT Finance DEV',
  // Geracao automatica de despesas fixas: LIGADA so no ambiente local (padrao do back e desligado).
  FIXED_EXPENSES_AUTOGEN: process.env.FIXED_EXPENSES_AUTOGEN ?? 'true',
  // Assinaturas AbacatePay (Dev mode): bloqueio LIGADO so no local; sem chave => checkout indisponivel.
  BILLING_ENFORCE: process.env.BILLING_ENFORCE ?? 'true',
  ABACATEPAY_API_KEY: local.ABACATEPAY_API_KEY ?? '',
  ABACATEPAY_WEBHOOK_SECRET: local.ABACATEPAY_WEBHOOK_SECRET ?? 'dev-webhook-secret',
  ABACATEPAY_PRODUCT_MONTHLY: local.ABACATEPAY_PRODUCT_MONTHLY ?? 'prod_XkzdXcbLdYD0f5tcbzBkY43B',
  ABACATEPAY_PRODUCT_ANNUAL: local.ABACATEPAY_PRODUCT_ANNUAL ?? 'prod_aukjU1GPYZY02crNctL6zUkk',
};

try {
  const host = assertLocal(env.DATABASE_URL);
  console.log(`[dev-env] DATABASE_URL host=${host} port=${cfg.DB_PORT} db=${cfg.DB_NAME} | API PORT=${cfg.API_PORT}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Uso: node dev-env/run.cjs <comando> [args]');
  process.exit(1);
}
const child = spawn(cmd, args, { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 1));
