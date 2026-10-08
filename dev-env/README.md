# Ambiente local isolado (dev/teste)

Postgres LOCAL descartavel (`embedded-postgres`, sem Docker) + dados sinteticos. **Nunca** usa o `.env` de producao para
`DATABASE_URL`: os comandos abaixo injetam `DATABASE_URL` local no processo (variavel de shell vence o `.env`) e o `guard.cjs`
aborta se o host nao for local / for `147.93.70.133`. SMTP e GROQ ficam vazios no processo dev.

Portas: Postgres `51294` (127.0.0.1), backend dev `55165` (prod usa 8347 — nao tocar). Override: `DEV_DB_PORT`, `DEV_API_PORT`.

## Subir (a partir de `pit-finance/`)
```
npm --prefix dev-env install        # uma vez
npm run dev:db                      # terminal 1: Postgres local (foreground)
npm run dev:migrate                 # aplica migracoes SO no banco local
npm run dev:seed                    # dev1@pit.local / dev2@pit.local, senha dev123456
npm run dev:api                     # terminal 2: backend em http://localhost:55165 (build + node dist/main)
```
## Resetar
Pare `dev:db` (Ctrl+C), depois `npm run dev:reset` e repita migrate + seed.

## Front (`front-finance/.env.local`, ignorado pelo git; nao altera `.env`)
```
API_INTERNAL_URL=http://localhost:55165
```
Rode `npm run dev -- -p 3001` no front (o backend dev aceita CORS de `http://localhost:3001`).

## Guard
`npm run dev:guard` e o `pretest:e2e` falham se a `DATABASE_URL` efetiva (shell > `.env`) nao for local.
Para e2e: `npm run dev:test:e2e`.

## ATENCAO
`npm run seed` (prisma/seed.js legado) apaga despesas/tags/receitas do usuario de teste e usa o `.env` => **nunca rodar sem `dev:`**.

## Geracao automatica de despesas fixas (flag)
As despesas fixas materializam sozinhas as ocorrencias (mes corrente ate +12 meses, sem backfill) em criar/editar regra e em `GET /expenses`.
| Variavel | Padrao | Efeito |
|---|---|---|
| `FIXED_EXPENSES_AUTOGEN` | **desligado** (so `true` liga) | Ausente/qualquer outro valor desliga TUDO (criacao e propagacao). `dev-env/run.cjs` define `true`. |
| `FIXED_EXPENSES_AUTOGEN_USERS` | vazio | Ids de usuario (separados por virgula) que restringem a geracao a esses usuarios. |
| `FIXED_EXPENSES_AUTOGEN_MAX_ROWS` | `500` | Teto de linhas criadas por execucao. |
| `APP_TIMEZONE` | `America/Sao_Paulo` | Fuso usado para calcular o "mes corrente". |

Exemplo (desligar no dev): `FIXED_EXPENSES_AUTOGEN=false npm run dev:api`.
`POST /fixed-expenses/generate/:year/:month` esta DEPRECADO (idempotente, sem uso na UI).

## Receitas fixas (salario, contratos)
Mesma mecanica das despesas fixas, gerando `Income` (em criar/editar regra e em `GET /incomes`). Reajuste: `PUT /fixed-incomes/:id`
com `amount` + `amountEffectiveFrom: "YYYY-MM"` grava o novo valor dali em diante (meses anteriores mantem o valor; lancamentos
editados a mao nunca mudam). Sem `amountEffectiveFrom` corrige o valor desde o inicio.
| Variavel | Padrao | Efeito |
|---|---|---|
| `FIXED_INCOMES_AUTOGEN` | herda `FIXED_EXPENSES_AUTOGEN` | Liga/desliga so as receitas fixas (`false` desliga mesmo com despesas ligadas). |
| `FIXED_INCOMES_AUTOGEN_USERS` / `_MAX_ROWS` | herdam as de despesas | Mesma semantica. |

## Assinaturas AbacatePay (cobranca)
Bloqueio do app inteiro sem teste/assinatura (Suporte, Configuracoes e Assinatura continuam abertos). Admin nunca e bloqueado.
| Variavel | Padrao | Efeito |
|---|---|---|
| `BILLING_ENFORCE` | **desligado** (so `true` liga) | Liga o bloqueio (API responde 402). `dev-env/run.cjs` define `true`. |
| `ABACATEPAY_API_KEY` | vazio | Chave da API v2. No dev vem de `dev-env/.env.local` e PRECISA comecar com `abc_dev_`. |
| `ABACATEPAY_PRODUCT_MONTHLY` / `ABACATEPAY_PRODUCT_ANNUAL` | vazio | Ids `prod_...` dos planos (o dev usa os produtos de teste). |
| `ABACATEPAY_WEBHOOK_SECRET` | vazio | Secret do webhook (`?webhookSecret=`). Sem ele todo webhook e recusado. |
| `ABACATEPAY_WEBHOOK_PUBLIC_KEY` | chave publica da doc | So se a AbacatePay rotacionar a chave do HMAC. |

Webhook: `POST /webhooks/abacatepay?webhookSecret=...` (HTTPS publico), eventos `subscription.completed`,
`subscription.renewed`, `subscription.cancelled`, `subscription.trial_started`. O acesso pago so muda pelo webhook.
Teste gratis: OPCIONAL, 7 dias, uma vez por conta (`POST /billing/trial`); o cadastro nao da teste automatico.
Usuarios anteriores a `20261004120000_trial_opt_in` ja receberam o teste no lancamento e nao podem iniciar outro.
