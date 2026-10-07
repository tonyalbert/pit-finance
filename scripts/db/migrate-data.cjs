// Copia os DADOS de um Postgres (origem) para outro (destino) que ja tem a MESMA estrutura (prisma migrate deploy).
//
//   SOURCE_DATABASE_URL=postgresql://... TARGET_DATABASE_URL=postgresql://... node scripts/db/migrate-data.cjs            -> simulacao (nao grava nada)
//   SOURCE_DATABASE_URL=postgresql://... TARGET_DATABASE_URL=postgresql://... node scripts/db/migrate-data.cjs --execute  -> copia
//
// Garantias:
// - Origem lida em uma transacao REPEATABLE READ READ ONLY (snapshot consistente, nunca escreve na origem).
// - Destino gravado em UMA transacao: qualquer erro => ROLLBACK, destino continua vazio.
// - Aborta se as migracoes Prisma, tabelas ou colunas divergirem, ou se o destino ja tiver dados.
// - Tabelas inseridas na ordem das foreign keys (nao precisa de superusuario).
// - Ao final confere contagem E checksum (md5) de cada tabela origem x destino antes do COMMIT.
const path = require('path');
const { Client } = require(path.join(__dirname, '..', '..', 'node_modules', 'pg'));

const BATCH = 500;
const SKIP = new Set(['_prisma_migrations']);
const execute = process.argv.includes('--execute');
const q = (id) => '"' + id.replace(/"/g, '""') + '"';

function describe(url, label) {
  if (!url) throw new Error(`${label} nao definida.`);
  const u = new URL(url);
  return `${u.hostname}:${u.port || 5432}${u.pathname}`;
}

async function migrations(c, label) {
  const exists = await c.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL ok");
  if (!exists.rows[0].ok) throw new Error(`${label} sem estrutura (_prisma_migrations nao existe). Rode "npx prisma migrate deploy" nele antes.`);
  const r = await c.query(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1',
  );
  return r.rows.map((x) => x.migration_name);
}

async function columns(c) {
  const r = await c.query(
    `SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) cols
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
      GROUP BY table_name`,
  );
  return new Map(r.rows.filter((x) => !SKIP.has(x.table_name)).map((x) => [x.table_name, x.cols]));
}

async function primaryKeys(c) {
  const r = await c.query(
    `SELECT t.relname tbl, string_agg(quote_ident(a.attname), ',' ORDER BY k.ord) pk
       FROM pg_constraint con
       JOIN pg_class t ON t.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
       CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE con.contype = 'p'
      GROUP BY t.relname`,
  );
  return new Map(r.rows.map((x) => [x.tbl, x.pk]));
}

// Ordem topologica pelas FKs: pais antes dos filhos.
async function insertOrder(c, tables) {
  const r = await c.query(
    `SELECT child.relname child, parent.relname parent
       FROM pg_constraint con
       JOIN pg_class child ON child.oid = con.conrelid
       JOIN pg_class parent ON parent.oid = con.confrelid
       JOIN pg_namespace n ON n.oid = child.relnamespace AND n.nspname = 'public'
      WHERE con.contype = 'f' AND child.oid <> parent.oid`,
  );
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of r.rows) if (deps.has(child) && deps.has(parent)) deps.get(child).add(parent);
  const order = [];
  while (deps.size) {
    const ready = [...deps].filter(([, p]) => [...p].every((x) => !deps.has(x))).map(([t]) => t).sort();
    if (!ready.length) throw new Error('Ciclo de foreign keys entre: ' + [...deps.keys()].join(', '));
    for (const t of ready) {
      order.push(t);
      deps.delete(t);
    }
  }
  return order;
}

async function count(c, t) {
  return (await c.query(`SELECT count(*)::int n FROM ${q(t)}`)).rows[0].n;
}

async function checksum(c, t, pk) {
  const r = await c.query(`SELECT md5(coalesce(string_agg(row_to_json(x)::text, E'\\n' ORDER BY ${pk}), '')) h FROM ${q(t)} x`);
  return r.rows[0].h;
}

async function main() {
  const srcUrl = process.env.SOURCE_DATABASE_URL;
  const dstUrl = process.env.TARGET_DATABASE_URL;
  const srcName = describe(srcUrl, 'SOURCE_DATABASE_URL');
  const dstName = describe(dstUrl, 'TARGET_DATABASE_URL');
  if (srcName === dstName) throw new Error('Origem e destino sao o mesmo banco.');
  console.log(`Origem : ${srcName}\nDestino: ${dstName}\nModo   : ${execute ? 'EXECUTAR' : 'simulacao (use --execute para copiar)'}\n`);

  const src = new Client({ connectionString: srcUrl });
  const dst = new Client({ connectionString: dstUrl });
  await src.connect();
  await dst.connect();
  try {
    await src.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const enc = async (c) => (await c.query('SHOW server_encoding')).rows[0].server_encoding;
    const [eSrc, eDst] = [await enc(src), await enc(dst)];
    if (eSrc !== eDst) throw new Error(`Encoding diferente: origem ${eSrc} x destino ${eDst}. Crie o banco destino com ENCODING '${eSrc}'.`);

    const [mSrc, mDst] = [await migrations(src, 'Origem'), await migrations(dst, 'Destino')];
    if (mSrc.join() !== mDst.join()) {
      const missing = mSrc.filter((m) => !mDst.includes(m));
      const extra = mDst.filter((m) => !mSrc.includes(m));
      throw new Error(
        'Migracoes divergentes. Rode "npx prisma migrate deploy" no destino (ou na origem) ate ficarem iguais.\n' +
          `  so na origem : ${missing.join(', ') || '-'}\n  so no destino: ${extra.join(', ') || '-'}`,
      );
    }
    console.log(`Migracoes Prisma iguais (${mSrc.length}).`);

    const [cSrc, cDst] = [await columns(src), await columns(dst)];
    const names = [...new Set([...cSrc.keys(), ...cDst.keys()])].sort();
    const diff = names.filter((t) => cSrc.get(t) !== cDst.get(t));
    if (diff.length) throw new Error('Estrutura divergente (tabelas/colunas) em: ' + diff.join(', '));

    const pks = await primaryKeys(dst);
    const noPk = names.filter((t) => !pks.has(t));
    if (noPk.length) throw new Error('Tabelas sem chave primaria (checksum precisa de ordem): ' + noPk.join(', '));

    const order = await insertOrder(dst, names);
    const plan = [];
    for (const t of order) plan.push({ tabela: t, origem: await count(src, t), destino: await count(dst, t) });
    console.table(plan);

    const dirty = plan.filter((p) => p.destino > 0);
    if (dirty.length) throw new Error('Destino ja tem dados em: ' + dirty.map((p) => p.tabela).join(', ') + '. Abortado.');
    if (!execute) {
      console.log('\nSimulacao OK. Nada foi gravado. Rode de novo com --execute para copiar.');
      return;
    }

    await dst.query('BEGIN');
    try {
      for (const t of order) {
        const pk = pks.get(t);
        let copied = 0;
        for (let offset = 0; ; offset += BATCH) {
          const { rows } = await src.query(
            `SELECT row_to_json(x)::text j FROM ${q(t)} x ORDER BY ${pk} LIMIT ${BATCH} OFFSET ${offset}`,
          );
          if (!rows.length) break;
          const json = '[' + rows.map((r) => r.j).join(',') + ']';
          await dst.query(`INSERT INTO ${q(t)} SELECT * FROM json_populate_recordset(NULL::${q(t)}, $1::json)`, [json]);
          copied += rows.length;
        }
        console.log(`  ${t}: ${copied} linhas`);
      }

      // Sequences (se houver colunas serial/identity) passam a continuar do maior valor copiado.
      const seqs = await dst.query(
        `SELECT c.table_name t, c.column_name col, pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) s
           FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) IS NOT NULL`,
      );
      for (const { t, col, s } of seqs.rows) {
        await dst.query(`SELECT setval($1, coalesce((SELECT max(${q(col)}) FROM ${q(t)}), 0) + 1, false)`, [s]);
      }

      const bad = [];
      for (const t of order) {
        const pk = pks.get(t);
        const [a, b] = [await count(src, t), await count(dst, t)];
        const [ha, hb] = [await checksum(src, t, pk), await checksum(dst, t, pk)];
        if (a !== b || ha !== hb) bad.push(`${t} (origem ${a}/${ha} x destino ${b}/${hb})`);
      }
      if (bad.length) throw new Error('Verificacao falhou: ' + bad.join('; '));

      await dst.query('COMMIT');
      console.log('\nOK: dados copiados e verificados (contagem + checksum de todas as tabelas).');
    } catch (e) {
      await dst.query('ROLLBACK');
      throw e;
    }
  } finally {
    await src.query('ROLLBACK').catch(() => {});
    await src.end();
    await dst.end();
  }
}

main().catch((e) => {
  console.error('\nERRO: ' + e.message);
  process.exit(1);
});
