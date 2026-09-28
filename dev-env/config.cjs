// Configuracao do ambiente LOCAL de dev/teste. Nada aqui aponta para producao.
const DB_PORT = Number(process.env.DEV_DB_PORT || 51294);
const API_PORT = Number(process.env.DEV_API_PORT || 55165);
const DB_NAME = 'pit_finance_dev';
// Credencial descartavel do Postgres local (127.0.0.1 apenas). Nao e segredo de producao.
const DB_USER = 'postgres';
const DB_PASS = 'pit_dev_local';

const DATABASE_URL = `postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}`;

module.exports = { DB_PORT, API_PORT, DB_NAME, DB_USER, DB_PASS, DATABASE_URL };
