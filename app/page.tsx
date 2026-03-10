"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Brain,
  CreditCard,
  PiggyBank,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"

export default function Home() {
  const router = useRouter()
  const { token, isReady } = useAuth()

  useEffect(() => {
    if (isReady && token) router.replace("/dashboard")
  }, [isReady, token, router])

  if (!isReady || token) return null

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md dark:bg-black/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Wallet className="size-6 text-emerald-500" />
            <span className="text-lg font-bold tracking-tight">Pit Finance</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Criar conta</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-emerald-500/10 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-20 text-center lg:pt-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            <Brain className="size-4" />
            Agora com análise inteligente por IA
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Controle financeiro{" "}
            <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
              simples e direto
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Organize suas receitas, despesas, parcelas e credores em um só lugar.
            Saiba exatamente para onde vai seu dinheiro — mês a mês.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                Começar grátis
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="gap-2">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Preview do sistema */}
      <section className="relative overflow-hidden border-t bg-white py-24 dark:bg-zinc-950">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[700px] rounded-full bg-emerald-500/5 blur-[100px]" />
        </div>
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Veja como funciona</h2>
            <p className="mt-4 text-muted-foreground">Uma visão geral do seu painel financeiro.</p>
          </div>

          {/* Mockup do dashboard */}
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border shadow-2xl shadow-emerald-500/10">
            {/* Barra do browser */}
            <div className="flex items-center gap-2 border-b bg-zinc-100 px-4 py-3 dark:bg-zinc-900">
              <div className="size-3 rounded-full bg-red-400" />
              <div className="size-3 rounded-full bg-yellow-400" />
              <div className="size-3 rounded-full bg-emerald-400" />
              <div className="ml-4 flex-1 rounded-md bg-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                pitfinance.app/dashboard
              </div>
            </div>

            {/* Conteúdo do dashboard mockup */}
            <div className="bg-zinc-50 p-4 dark:bg-zinc-900 sm:p-6">

              {/* Cards de resumo */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Receita", value: "R$ 5.200", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
                  { label: "Despesas", value: "R$ 3.840", color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/40" },
                  { label: "Saldo", value: "R$ 1.360", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
                  { label: "Parcelas", value: "R$ 980", color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/40" },
                ].map((card) => (
                  <div key={card.label} className={`rounded-lg border p-3 ${card.bg}`}>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <p className={`mt-1 text-lg font-bold tabular-nums ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {/* Gráfico simulado */}
                <div className="rounded-lg border bg-white p-4 dark:bg-zinc-800 lg:col-span-2">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Receitas e despesas por mês</p>
                  <div className="flex items-end gap-2 h-28">
                    {[
                      { r: 60, d: 45 }, { r: 75, d: 55 }, { r: 55, d: 70 },
                      { r: 80, d: 60 }, { r: 70, d: 50 }, { r: 90, d: 65 },
                      { r: 85, d: 72 }, { r: 95, d: 68 },
                    ].map((bar, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div className="flex w-full items-end gap-0.5">
                          <div className="flex-1 rounded-t bg-emerald-400/80 dark:bg-emerald-500/70 transition-all" style={{ height: `${bar.r}%` }} />
                          <div className="flex-1 rounded-t bg-red-400/60 dark:bg-red-500/50 transition-all" style={{ height: `${bar.d}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-4">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><span className="inline-block size-2 rounded-full bg-emerald-400" />Receitas</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><span className="inline-block size-2 rounded-full bg-red-400" />Despesas</span>
                  </div>
                </div>

                {/* Credores */}
                <div className="rounded-lg border bg-white p-4 dark:bg-zinc-800">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Credores — Março</p>
                  <div className="space-y-2">
                    {[
                      { name: "Banco Itaú", total: "R$ 450", pago: true },
                      { name: "Cartão Nubank", total: "R$ 320", pago: false },
                      { name: "Financeira", total: "R$ 210", pago: false },
                    ].map((c) => (
                      <div key={c.name} className="flex items-center justify-between rounded-md border p-2">
                        <div>
                          <p className="text-xs font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.total}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.pago ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
                          {c.pago ? "Quitado" : "Pendente"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tabela de despesas */}
              <div className="mt-4 rounded-lg border bg-white dark:bg-zinc-800">
                <div className="border-b px-4 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">Despesas — Março 2026</p>
                </div>
                <div className="divide-y">
                  {[
                    { item: "Aluguel", tag: "Moradia", valor: "R$ 1.500", pago: true },
                    { item: "1/12 - iPhone 15", tag: "Eletrônicos", valor: "R$ 450", pago: true },
                    { item: "Supermercado", tag: "Alimentação", valor: "R$ 380", pago: false },
                    { item: "2/12 - Notebook", tag: "Eletrônicos", valor: "R$ 280", pago: false },
                  ].map((row) => (
                    <div key={row.item} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className={`size-1.5 rounded-full ${row.pago ? "bg-emerald-500" : "bg-red-400"}`} />
                        <span className="text-xs font-medium">{row.item}</span>
                        <span className="hidden rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300 sm:inline">{row.tag}</span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums">{row.valor}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Análise IA */}
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="mb-2 flex items-center gap-2">
                  <Brain className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Análise com IA — Março 2026</p>
                </div>
                <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-200">
                  💰 <strong>Saldo positivo de R$ 1.360</strong> — bom controle no mês. ⚠️ Gastos com Eletrônicos representam 19% das despesas, atenção às parcelas futuras. ✅ Aluguel e alimentação dentro do esperado.
                </p>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-white py-24 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Tudo que você precisa para organizar suas finanças
            </h2>
            <p className="mt-4 text-muted-foreground">
              Sem complicação, sem planilha. Só o que importa.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<TrendingUp className="size-6" />}
              title="Receitas e despesas"
              description="Registre tudo em poucos cliques. Edite direto na tabela, sem formulários intermináveis."
            />
            <FeatureCard
              icon={<CreditCard className="size-6" />}
              title="Compras parceladas"
              description="Crie parcelas com um comando. Altere tag e credor de todas as parcelas de uma vez."
            />
            <FeatureCard
              icon={<PiggyBank className="size-6" />}
              title="Controle de credores"
              description="Saiba quanto deve, para quem e quando. Filtre por mês e acompanhe o que já foi quitado."
            />
            <FeatureCard
              icon={<BarChart3 className="size-6" />}
              title="Gráficos por mês"
              description="Visualize a evolução mensal das receitas e despesas, com detalhamento por categoria."
            />
            <FeatureCard
              icon={<Brain className="size-6" />}
              title="Análise com IA"
              description="Receba insights personalizados do seu mês: pontos de atenção, gastos elevados e dicas práticas."
            />
            <FeatureCard
              icon={<Shield className="size-6" />}
              title="Seus dados, seu controle"
              description="Acesso protegido por autenticação. Cada usuário só vê e edita os próprios dados."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t py-24">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Comece a organizar suas finanças agora
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            É gratuito. Crie sua conta em segundos e tenha uma visão clara do seu dinheiro.
          </p>
          <div className="mt-10">
            <Link href="/register">
              <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                Criar minha conta grátis
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-emerald-500" />
            <span>Pit Finance</span>
          </div>
          <span>&copy; {new Date().getFullYear()} Pit Finance</span>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="group rounded-xl border bg-zinc-50 p-6 transition-all hover:border-emerald-200 hover:shadow-md dark:bg-zinc-900 dark:hover:border-emerald-900">
      <div className="mb-4 inline-flex rounded-lg bg-emerald-100 p-2.5 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}
