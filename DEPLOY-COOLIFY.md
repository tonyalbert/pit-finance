# Deploy na Coolify + migração do banco

Banco novo: `207.180.222.79:5432/db_pitfinance` (vazio).
Banco antigo: `147.93.70.133:8432/pit_finance`, Postgres 17, 9 migrações aplicadas, cerca de 1.100 linhas (out/2026).

Ordem: **1. estrutura → 2. dados → 3. deploy/virada**. O banco antigo só é lido, nunca alterado. Se algo der errado, basta continuar usando o antigo.

> As senhas com caracteres especiais (`@ : / # ? %`) precisam ser URL-encoded na connection string (`@` vira `%40`, `#` vira `%23`).

## 1. Criar a estrutura no banco novo

Rode da sua máquina (PowerShell, dentro de `pit-finance/`). A porta 5432 da VPS precisa estar acessível a partir do seu IP.

```powershell
$env:DATABASE_URL = "postgresql://USUARIO:SENHA@207.180.222.79:5432/db_pitfinance"
npm run db:deploy   # aplica as 9 migrações (cria tabelas, enums, índices)
npm run db:status   # deve mostrar "Database schema is up to date!"
Remove-Item Env:DATABASE_URL
```

(Alternativa: o container já roda `prisma migrate deploy` ao subir, então o primeiro deploy na Coolify também cria a estrutura.)

## 2. Migrar os dados

1. **Pare as escritas no banco antigo** (pare o backend antigo ou avise os usuários). O que for gravado depois da cópia não vai junto.
2. Faça uma simulação. Ela não grava nada, mas confere migrações, encoding, tabelas e colunas, e mostra as contagens:

```powershell
$env:SOURCE_DATABASE_URL = "postgresql://postgres:SENHA_ANTIGA@147.93.70.133:8432/pit_finance"
$env:TARGET_DATABASE_URL = "postgresql://USUARIO:SENHA@207.180.222.79:5432/db_pitfinance"
npm run db:migrate-data
```

3. Execute a cópia:

```powershell
npm run db:migrate-data -- --execute
Remove-Item Env:SOURCE_DATABASE_URL, Env:TARGET_DATABASE_URL
```

O script (`scripts/db/migrate-data.cjs`):
- lê a origem num snapshot consistente e somente leitura;
- grava o destino numa única transação (se houver erro, faz ROLLBACK e o destino fica vazio);
- **recusa rodar** se o destino já tiver dados, se as migrações forem diferentes ou se o encoding for diferente;
- confere a contagem e o checksum md5 de cada tabela antes do COMMIT.

Se precisar refazer, limpe o destino (drop/recreate do `db_pitfinance`) e repita os passos 1 e 2.

## 3. Backend na Coolify

1. **New Resource → Application → repositório `pit-finance`**, Build Pack **Dockerfile** (não use o docker-compose, porque ele publica a porta direto no host).
2. **Ports Exposes:** `8347`. Coloque o domínio, por exemplo `https://api.seudominio.com.br`.
3. **Environment Variables:** copie a lista do `.env.example`. Os pontos de atenção são:
   - `DATABASE_URL`: se o Postgres for um recurso da Coolify na mesma VPS, use a **URL interna** que a Coolify mostra (host = nome do container). Assim o tráfego não passa pela internet.
   - `FRONTEND_URL`: o domínio do front, sem barra no final (CORS).
   - `JWT_SECRET`: **mantenha o mesmo** de hoje para que ninguém seja deslogado (ou troque de propósito para forçar novo login).
   - `ABACATEPAY_*`: não existem no `.env` atual. Com `BILLING_ENFORCE=true` e sem chave, o checkout fica indisponível.
4. O Dockerfile tem um `HEALTHCHECK` em `GET /`. A Coolify só considera o deploy pronto quando ele passa.
5. No painel da AbacatePay, atualize a URL do webhook para o domínio novo.

## 4. Front na Coolify (`front-finance`)

- Build Pack **Dockerfile**, porta `4821`.
- `API_INTERNAL_URL` é **lido no build** (rewrite do Next). Cadastre-o como **Build Variable** apontando para o backend, por exemplo `https://api.seudominio.com.br` ou a URL interna do container do backend (`http://<container-backend>:8347`).

## 5. Depois da virada

- Teste o login com um usuário real e confira despesas, receitas e tickets.
- Se abriu a 5432 para a internet só para a migração, feche a porta (ou restrinja ao seu IP) no firewall/Coolify.
- Mantenha o banco antigo intocado por alguns dias como backup.
