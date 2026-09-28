// Helpers puros para competencias mensais ("YYYY-MM") das despesas fixas.
// "Mes corrente" e calculado em APP_TIMEZONE (padrao America/Sao_Paulo), nunca no TZ do servidor.
// Datas de ocorrencias sao sempre UTC.

export const WINDOW_MONTHS = 12;

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function appTimezone(): string {
  return process.env.APP_TIMEZONE || 'America/Sao_Paulo';
}

/** "YYYY-MM" do instante `now` no fuso da aplicacao. */
export function currentMonthKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: appTimezone(),
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

export function monthKeyOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** Lista de competencias de `from` ate `to` (inclusive); vazia se from > to. */
export function monthsRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}

/** Primeiro instante (UTC) da competencia. */
export function monthStartUtc(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Data da ocorrencia: dia do vencimento com clamp ao ultimo dia do mes, em UTC. */
export function occurrenceDate(key: string, dayOfMonth: number): Date {
  const [y, m] = key.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(dayOfMonth, lastDay)));
}

/** Normaliza para meia-noite UTC de YYYY-MM-DD. */
export function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
