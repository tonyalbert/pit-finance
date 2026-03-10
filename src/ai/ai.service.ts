import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AnalysisPayload = {
  month: number;
  year: number;
  totalIncome: number;
  totalExpense: number;
  incomes: { source: string; amount: number; tag?: string }[];
  expenses: { item: string; amount: number; tag?: string; creditor?: string; isPaid: boolean }[];
  creditors: { name: string; totalAmount: number; paidAmount: number; unpaidAmount: number }[];
};

@Injectable()
export class AiService {
  constructor(private readonly config: ConfigService) {}

  async analyze(payload: AnalysisPayload): Promise<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const MONTHS_PT = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];

    const prompt = `
Você é um assistente de finanças pessoais. Analise os dados financeiros abaixo referentes a ${MONTHS_PT[payload.month - 1]} de ${payload.year} e forneça:

1. Um resumo claro do mês (saldo, situação geral)
2. Pontos de atenção (gastos elevados, contas em atraso, credores com dívida pendente)
3. Dicas práticas e objetivas para melhorar o controle financeiro

Responda em português, de forma direta e organizada. Use tópicos com emojis para facilitar a leitura. Sem introduções desnecessárias.
Desconsidete as informações de dia do campo "data" pois entendemos que o usuário quer uma análise mensal, não diária.
Não alivie para o usuário, seja direto e objetivo, mesmo que a situação financeira seja difícil. O objetivo é ajudar o usuário a ter uma visão clara da sua situação e motivá-lo a tomar ações para melhorar.
Não dê conselhos genéricos, seja específico com base nos dados fornecidos. Por exemplo, se houver uma despesa elevada em alimentação, destaque isso e sugira formas de reduzir esse gasto.
Entendemos que as contas do mês não estão em atraso, se tiver contas pendentes com data anterior a data atual não considere como atraso.

--- DADOS ---
Receita total: R$ ${payload.totalIncome.toFixed(2)}
Despesa total: R$ ${payload.totalExpense.toFixed(2)}
Saldo: R$ ${(payload.totalIncome - payload.totalExpense).toFixed(2)}

Receitas:
${payload.incomes.map((i) => `- ${i.source}${i.tag ? ` [${i.tag}]` : ''}: R$ ${i.amount.toFixed(2)}`).join('\n') || '- Nenhuma'}

Despesas:
${payload.expenses.map((e) => `- ${e.item}${e.tag ? ` [${e.tag}]` : ''}${e.creditor ? ` (credor: ${e.creditor})` : ''}: R$ ${e.amount.toFixed(2)} - ${e.isPaid ? 'Pago' : 'Pendente'}`).join('\n') || '- Nenhuma'}

Credores com dívida no mês:
${payload.creditors.filter((c) => c.totalAmount > 0).map((c) => `- ${c.name}: total R$ ${c.totalAmount.toFixed(2)}, pago R$ ${c.paidAmount.toFixed(2)}, restante R$ ${c.unpaidAmount.toFixed(2)}`).join('\n') || '- Nenhum'}
`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Erro na API Groq: ${err}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    return data.choices?.[0]?.message?.content ?? 'Sem resposta da IA.';
  }
}
