"use client"

import * as React from "react"
import { toast } from "sonner"
import { AuthGuard } from "@/components/auth/auth-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useAuth } from "@/hooks/use-auth"
import { apiFetch } from "@/lib/api"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Area, AreaChart, CartesianGrid, LabelList, Pie, PieChart, XAxis, Label as RechartsLabel } from "recharts"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CheckCircle2,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag,
  Calendar,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Edit,
  X,
  User,
  Phone,
  Mail,
  UserCircle,
} from "lucide-react"
import { ThemeSettingsModal } from "@/components/theme-settings-modal"

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateInput(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

function formatDateDisplay(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("pt-BR")
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  if (value && typeof value === "object" && "toString" in value) {
    return Number(String(value))
  }
  return 0
}

type ApiIncome = {
  id: string
  source: string
  amount: unknown
  date: string
  tagId: string | null
}

type ApiExpense = {
  id: string
  item: string
  amount: unknown
  date: string
  isPaid: boolean
  tagId: string | null
  creditorId: string | null
  installmentGroupId?: string | null
  installmentNumber?: number | null
  installmentTotal?: number | null
}

type ApiTag = {
  id: string
  name: string
  type: "INCOME" | "EXPENSE"
}

type ApiCreditor = {
  id: string
  name: string
  phone: string | null
  email: string | null
  totalAmount: number
  paidAmount: number
  unpaidAmount: number
  isPaidOff: boolean
  expenseCount: number
}

type ApiCreditorDetails = {
  id: string
  name: string
  phone: string | null
  email: string | null
  expenses: ApiExpense[]
}

const MONTHS = [
  { label: "Janeiro", short: "Jan" },
  { label: "Fevereiro", short: "Fev" },
  { label: "Marco", short: "Mar" },
  { label: "Abril", short: "Abr" },
  { label: "Maio", short: "Mai" },
  { label: "Junho", short: "Jun" },
  { label: "Julho", short: "Jul" },
  { label: "Agosto", short: "Ago" },
  { label: "Setembro", short: "Set" },
  { label: "Outubro", short: "Out" },
  { label: "Novembro", short: "Nov" },
  { label: "Dezembro", short: "Dez" },
] as const

const CHART_PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const

const spendConfig = {
  gastos: { label: "Despesas", color: "var(--color-chart-1)" },
  receitas: { label: "Receitas", color: "var(--color-chart-2)" },
} satisfies ChartConfig

type MonthCardData = {
  key: string
  label: string
  quarter: 1 | 2 | 3 | 4
  year: number
  income: number
  expense: number
  dotColor: string
  isCurrentMonth?: boolean
}

function getQuarter(monthIndex: number): 1 | 2 | 3 | 4 {
  return (Math.floor(monthIndex / 3) + 1) as 1 | 2 | 3 | 4
}

function getSemester(monthIndex: number): 1 | 2 {
  return monthIndex < 6 ? 1 : 2
}

function buildTopCategories(
  entries: Array<[string, number]>,
  maxItems: number
): Array<[string, number]> {
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  if (sorted.length <= maxItems) return sorted
  const top = sorted.slice(0, maxItems)
  const rest = sorted.slice(maxItems)
  const othersTotal = rest.reduce((acc, [, v]) => acc + v, 0)
  if (othersTotal > 0) top.push(["Outros", othersTotal])
  return top
}

function buildDonutData(
  pairs: Array<[string, number]>
): { data: { name: string; value: number; fill: string }[]; config: ChartConfig } {
  const data = pairs.map(([name, value], index) => ({
    name,
    value,
    fill: CHART_PALETTE[index % CHART_PALETTE.length],
  }))

  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [
      d.name,
      {
        label: d.name,
        color: d.fill,
      },
    ])
  )
  return { data, config }
}

function CompactLegend({
  data,
  config,
}: {
  data: Array<{ name: string; fill: string }>
  config: ChartConfig
}) {
  if (!data?.length) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 px-2 pt-2">
      {data.map((item, idx) => {
        const itemConfig = config[item.name]
        const label = itemConfig?.label || item.name
        const color = itemConfig?.color || item.fill

        return (
          <div
            key={idx}
            className="flex items-center gap-1.5 text-[10px] leading-tight"
          >
            <div
              className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: color }}
            />
            <span className="whitespace-nowrap">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function SortableHeader({
  column,
  currentSort,
  sortDirection,
  onSort,
  icon: Icon,
  children,
  align = "left",
}: {
  column: "item" | "amount" | "date" | "tagId" | "creditorId" | "isPaid"
  currentSort: "item" | "amount" | "date" | "tagId" | "creditorId" | "isPaid" | null
  sortDirection: "asc" | "desc"
  onSort: (col: "item" | "amount" | "date" | "tagId" | "creditorId" | "isPaid") => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  align?: "left" | "right"
}) {
  const isSorted = currentSort === column
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors ${
        align === "right" ? "pr-6 text-right" : ""
      }`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
        <Icon className="size-4 text-muted-foreground" />
        <span>{children}</span>
        {isSorted ? (
          sortDirection === "asc" ? (
            <ArrowUp className="size-3.5 text-foreground" />
          ) : (
            <ArrowDown className="size-3.5 text-foreground" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 text-muted-foreground opacity-50" />
        )}
      </div>
    </TableHead>
  )
}

function SortableIncomeHeader({
  column,
  currentSort,
  sortDirection,
  onSort,
  icon: Icon,
  children,
  align = "left",
}: {
  column: "source" | "amount" | "date" | "tagId"
  currentSort: "source" | "amount" | "date" | "tagId" | null
  sortDirection: "asc" | "desc"
  onSort: (col: "source" | "amount" | "date" | "tagId") => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  align?: "left" | "right"
}) {
  const isSorted = currentSort === column
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors ${
        align === "right" ? "pr-6 text-right" : ""
      }`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
        <Icon className="size-4 text-muted-foreground" />
        <span>{children}</span>
        {isSorted ? (
          sortDirection === "asc" ? (
            <ArrowUp className="size-3.5 text-foreground" />
          ) : (
            <ArrowDown className="size-3.5 text-foreground" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 text-muted-foreground opacity-50" />
        )}
      </div>
    </TableHead>
  )
}

function MonthCard({ month, hasInstallments }: { month: MonthCardData; hasInstallments?: boolean }) {
  const balance = month.income - month.expense
  const balanceClass =
    balance > 0
      ? "text-emerald-400"
      : balance < 0
        ? "text-red-400"
        : "text-muted-foreground"

  return (
    <Card
      className={[
        "py-4",
        month.isCurrentMonth
          ? "ring-1 ring-ring/50 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          : "",
        hasInstallments
          ? "border-blue-200 dark:border-blue-900"
          : "",
      ].join(" ")}
    >
      <CardContent className="px-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: month.dotColor }}
            />
            <div className="text-sm font-semibold">{month.label}</div>
          </div>
          {hasInstallments && (
            <div className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Parcelas
            </div>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Receita:</span>
            <span className="font-medium tabular-nums">{formatBRL(month.income)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Despesa:</span>
            <span className="font-medium tabular-nums">{formatBRL(month.expense)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Saldo:</span>
            <span className={`font-semibold tabular-nums ${balanceClass}`}>
              {formatBRL(balance)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user, token, logout } = useAuth()
  const now = React.useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonthIndex = now.getMonth()
  const defaultQuarterTab = `q${getQuarter(currentMonthIndex)}`
  const defaultQuarterTabExpenses = `q${getQuarter(currentMonthIndex)}`

  const [selectedYear, setSelectedYear] = React.useState<string>(String(currentYear))
  const [activeTab, setActiveTab] = React.useState<string>(defaultQuarterTab)
  const [expenseQuarter, setExpenseQuarter] = React.useState<string>(defaultQuarterTabExpenses)
  const [incomeQuarter, setIncomeQuarter] = React.useState<string>(defaultQuarterTabExpenses)
  const [selectedExpenseIds, setSelectedExpenseIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [selectedIncomeIds, setSelectedIncomeIds] = React.useState<Set<string>>(
    () => new Set()
  )

  const [tags, setTags] = React.useState<ApiTag[]>([])
  const [incomes, setIncomes] = React.useState<ApiIncome[]>([])
  const [expenses, setExpenses] = React.useState<ApiExpense[]>([])
  const [creditors, setCreditors] = React.useState<ApiCreditor[]>([])
  const [allCreditors, setAllCreditors] = React.useState<ApiCreditor[]>([])
  const [isLoadingData, setIsLoadingData] = React.useState(false)
  const [editingCell, setEditingCell] = React.useState<{
    id: string
    field: "item" | "amount" | "date" | "tagId" | "creditorId"
  } | null>(null)
  const [editingIncomeCell, setEditingIncomeCell] = React.useState<{
    id: string
    field: "source" | "amount" | "date" | "tagId"
  } | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, Partial<ApiExpense>>>({})
  const [draftsIncome, setDraftsIncome] = React.useState<Record<string, Partial<ApiIncome>>>({})
  const [savingRowId, setSavingRowId] = React.useState<string | null>(null)
  const [savingIncomeId, setSavingIncomeId] = React.useState<string | null>(null)
  const [sortColumn, setSortColumn] = React.useState<"item" | "amount" | "date" | "tagId" | "creditorId" | "isPaid" | null>(null)
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("desc")
  const [sortColumnIncome, setSortColumnIncome] = React.useState<"source" | "amount" | "date" | "tagId" | null>(null)
  const [sortDirectionIncome, setSortDirectionIncome] = React.useState<"asc" | "desc">("desc")

  const [isTagDialogOpen, setIsTagDialogOpen] = React.useState(false)
  const [newTagName, setNewTagName] = React.useState("")
  const [newTagType, setNewTagType] = React.useState<"INCOME" | "EXPENSE">("EXPENSE")
  const [editingTagId, setEditingTagId] = React.useState<string | null>(null)
  const [editingTagName, setEditingTagName] = React.useState("")

  const [isCreditorDialogOpen, setIsCreditorDialogOpen] = React.useState(false)
  const [newCreditorName, setNewCreditorName] = React.useState("")
  const [newCreditorPhone, setNewCreditorPhone] = React.useState("")
  const [newCreditorEmail, setNewCreditorEmail] = React.useState("")

  const [isInstallmentDialogOpen, setIsInstallmentDialogOpen] = React.useState(false)
  const [selectedMonthForInstallment, setSelectedMonthForInstallment] = React.useState<number | null>(null)
  const [installmentMonths, setInstallmentMonths] = React.useState<number>(1)
  const [installmentItem, setInstallmentItem] = React.useState("")
  const [installmentAmount, setInstallmentAmount] = React.useState("")
  const [installmentCreditorId, setInstallmentCreditorId] = React.useState<string>("")
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = React.useState<string | null>(null)
  const [pendingGroupUpdate, setPendingGroupUpdate] = React.useState<{
    groupId: string
    field: "tagId" | "creditorId"
    value: string
    expenseId: string
    payload: Partial<ApiExpense>
  } | null>(null)
  const [creditorDetails, setCreditorDetails] = React.useState<ApiCreditorDetails | null>(null)
  const [isCreditorDetailsOpen, setIsCreditorDetailsOpen] = React.useState(false)
  const [isLoadingCreditorDetails, setIsLoadingCreditorDetails] = React.useState(false)
  const [creditorFilterMonth, setCreditorFilterMonth] = React.useState<string>(String(new Date().getMonth() + 1))
  const [creditorFilterYear, setCreditorFilterYear] = React.useState<string>(String(new Date().getFullYear()))
  const [aiAnalysis, setAiAnalysis] = React.useState<string>("")
  const [isLoadingAi, setIsLoadingAi] = React.useState(false)
  const [aiMonth, setAiMonth] = React.useState<string>(String(new Date().getMonth() + 1))
  const [aiYear, setAiYear] = React.useState<string>(String(new Date().getFullYear()))

  const fetchCreditors = React.useCallback(async (month: string, year: string) => {
    if (!token) return
    const creditorsRes = await apiFetch<ApiCreditor[]>(
      `/creditors/summary?month=${month}&year=${year}`,
      { token },
    )
    setCreditors(creditorsRes)
  }, [token])

  React.useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setIsLoadingData(true)
      try {
        const [tagsRes, incomesRes, expensesRes, creditorsRes, allCreditorsRes] = await Promise.all([
          apiFetch<ApiTag[]>("/tags", { token }),
          apiFetch<ApiIncome[]>("/incomes", { token }),
          apiFetch<ApiExpense[]>("/expenses", { token }),
          apiFetch<ApiCreditor[]>(`/creditors/summary?month=${creditorFilterMonth}&year=${creditorFilterYear}`, { token }),
          apiFetch<ApiCreditor[]>("/creditors/summary", { token }),
        ])
        if (cancelled) return
        setTags(tagsRes)
        setIncomes(incomesRes)
        setExpenses(expensesRes)
        setCreditors(creditorsRes)
        setAllCreditors(allCreditorsRes)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro ao carregar dados."
        toast.error(message)
      } finally {
        if (!cancelled) setIsLoadingData(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  React.useEffect(() => {
    fetchCreditors(creditorFilterMonth, creditorFilterYear)
  }, [creditorFilterMonth, creditorFilterYear, fetchCreditors])

  const tagById = React.useMemo(() => {
    return new Map(tags.map((t) => [t.id, t]))
  }, [tags])

  const expenseTags = React.useMemo(() => {
    return tags.filter((t) => t.type === "EXPENSE")
  }, [tags])

  const incomeTags = React.useMemo(() => {
    return tags.filter((t) => t.type === "INCOME")
  }, [tags])

  function updateExpenseLocal(id: string, patch: Partial<ApiExpense>) {
    setExpenses((prev) =>
      prev.map((expense) => (expense.id === id ? { ...expense, ...patch } : expense))
    )
  }

  function updateIncomeLocal(id: string, patch: Partial<ApiIncome>) {
    setIncomes((prev) =>
      prev.map((income) => (income.id === id ? { ...income, ...patch } : income))
    )
  }

  function startEdit(id: string, field: "item" | "amount" | "date" | "tagId" | "creditorId") {
    setEditingCell({ id, field })
    setDrafts((prev) => {
      if (prev[id]) return prev
      const current = expenses.find((e) => e.id === id)
      if (!current) return prev
      return {
        ...prev,
        [id]: {
          item: current.item,
          amount: current.amount,
          date: current.date,
          tagId: current.tagId,
          creditorId: current.creditorId,
        },
      }
    })
  }

  function startIncomeEdit(id: string, field: "source" | "amount" | "date" | "tagId") {
    setEditingIncomeCell({ id, field })
    setDraftsIncome((prev) => {
      if (prev[id]) return prev
      const current = incomes.find((i) => i.id === id)
      if (!current) return prev
      return {
        ...prev,
        [id]: {
          source: current.source,
          amount: current.amount,
          date: current.date,
          tagId: current.tagId,
        },
      }
    })
  }

  async function saveField(
    id: string,
    field: "item" | "amount" | "date" | "tagId" | "creditorId",
    value: string
  ) {
    const current = expenses.find((e) => e.id === id)
    if (!current || !token) return

    const payload: Partial<ApiExpense> = {}
    if (field === "item") {
      if (value.trim().length < 2) {
        toast.error("Item precisa ter pelo menos 2 caracteres.")
        return
      }
      payload.item = value.trim()
    }
    if (field === "amount") {
      const amount = Number(value)
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Valor precisa ser maior que zero.")
        return
      }
      payload.amount = amount
    }
    if (field === "date") {
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) {
        toast.error("Data invalida.")
        return
      }
      payload.date = d.toISOString()
    }
    if (field === "tagId") payload.tagId = value === "none" ? null : value
    if (field === "creditorId") payload.creditorId = value === "none" ? null : value

    if ((field === "tagId" || field === "creditorId") && current.installmentGroupId) {
      setPendingGroupUpdate({ groupId: current.installmentGroupId, field, value, expenseId: id, payload })
      setEditingCell(null)
      return
    }

    setSavingRowId(id)
    try {
      await apiFetch(`/expenses/${id}`, {
        method: "PUT",
        token,
        body: JSON.stringify(payload),
      })
      updateExpenseLocal(id, payload)
      setEditingCell(null)
      fetchCreditors(creditorFilterMonth, creditorFilterYear)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao salvar despesa."
      toast.error(message)
    } finally {
      setSavingRowId(null)
    }
  }

  async function saveIncomeField(
    id: string,
    field: "source" | "amount" | "date" | "tagId",
    value: string
  ) {
    const current = incomes.find((i) => i.id === id)
    if (!current || !token) return

    const payload: Partial<ApiIncome> = {}
    if (field === "source") {
      if (value.trim().length < 2) {
        toast.error("Fonte precisa ter pelo menos 2 caracteres.")
        return
      }
      payload.source = value.trim()
    }
    if (field === "amount") {
      const amount = Number(value)
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Valor precisa ser maior que zero.")
        return
      }
      payload.amount = amount
    }
    if (field === "date") {
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) {
        toast.error("Data invalida.")
        return
      }
      payload.date = d.toISOString()
    }
    if (field === "tagId") payload.tagId = value === "none" ? null : value

    setSavingIncomeId(id)
    try {
      await apiFetch(`/incomes/${id}`, {
        method: "PUT",
        token,
        body: JSON.stringify(payload),
      })
      updateIncomeLocal(id, payload)
      setEditingIncomeCell(null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao salvar receita."
      toast.error(message)
    } finally {
      setSavingIncomeId(null)
    }
  }

  async function togglePaid(id: string, value: boolean) {
    if (!token) return
    setSavingRowId(id)
    try {
      await apiFetch(`/expenses/${id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ isPaid: value }),
      })
      updateExpenseLocal(id, { isPaid: value })
      fetchCreditors(creditorFilterMonth, creditorFilterYear)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao atualizar status."
      toast.error(message)
    } finally {
      setSavingRowId(null)
    }
  }

  const handleDeleteSelected = React.useCallback(
    async (monthIds?: string[]) => {
      const idsToDelete = monthIds
        ? monthIds.filter((id) => selectedExpenseIds.has(id))
        : Array.from(selectedExpenseIds)
      if (!token || idsToDelete.length === 0) return
      setSavingRowId("delete")
      try {
        await Promise.all(
          idsToDelete.map((id) =>
            apiFetch(`/expenses/${id}`, {
              method: "DELETE",
              token,
            })
          )
        )
        setExpenses((prev) => prev.filter((exp) => !idsToDelete.includes(exp.id)))
        setSelectedExpenseIds((prev) => {
          const next = new Set(prev)
          idsToDelete.forEach((id) => next.delete(id))
          return next
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro ao excluir despesas."
        toast.error(message)
      } finally {
        setSavingRowId(null)
      }
    },
    [selectedExpenseIds, token]
  )

  const handleDeleteInstallmentGroup = React.useCallback(
    async (groupId: string) => {
      if (!token) return
      setSavingRowId("delete")
      try {
        await apiFetch(`/expenses/group/${groupId}`, {
          method: "DELETE",
          token,
        })
        setExpenses((prev) => prev.filter((exp) => exp.installmentGroupId !== groupId))
        toast.success("Todas as parcelas foram excluídas!")
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro ao excluir parcelas."
        toast.error(message)
      } finally {
        setSavingRowId(null)
      }
    },
    [token]
  )

  const handleDeleteIncomeSelected = React.useCallback(
    async (monthIds?: string[]) => {
      const idsToDelete = monthIds
        ? monthIds.filter((id) => selectedIncomeIds.has(id))
        : Array.from(selectedIncomeIds)
      if (!token || idsToDelete.length === 0) return
      setSavingIncomeId("delete")
      try {
        await Promise.all(
          idsToDelete.map((id) =>
            apiFetch(`/incomes/${id}`, {
              method: "DELETE",
              token,
            })
          )
        )
        setIncomes((prev) => prev.filter((inc) => !idsToDelete.includes(inc.id)))
        setSelectedIncomeIds((prev) => {
          const next = new Set(prev)
          idsToDelete.forEach((id) => next.delete(id))
          return next
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro ao excluir receitas."
        toast.error(message)
      } finally {
        setSavingIncomeId(null)
      }
    },
    [selectedIncomeIds, token]
  )

  async function handleAddExpense(monthIndex: number) {
    if (!token) return
    const monthKey = `${selectedYearNumber}-${monthIndex}`
    setSavingRowId(monthKey)
    try {
      const date = new Date(selectedYearNumber, monthIndex, 1)
      const payload = {
        item: "Nova despesa",
        amount: 1,
        date: date.toISOString(),
        isPaid: false,
        tagId: expenseTags[0]?.id,
        creditorId: null,
      }
      const created = await apiFetch<ApiExpense>("/expenses", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      })
      setExpenses((prev) => [created, ...prev])
      startEdit(created.id, "item")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao criar despesa."
      toast.error(message)
    } finally {
      setSavingRowId(null)
    }
  }

  async function handleAddIncome(monthIndex: number) {
    if (!token) return
    const monthKey = `${selectedYearNumber}-${monthIndex}`
    setSavingIncomeId(monthKey)
    try {
      const date = new Date(selectedYearNumber, monthIndex, 1)
      const payload = {
        source: "Nova receita",
        amount: 1,
        date: date.toISOString(),
        tagId: incomeTags[0]?.id,
      }
      const created = await apiFetch<ApiIncome>("/incomes", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      })
      setIncomes((prev) => [created, ...prev])
      startIncomeEdit(created.id, "source")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao criar receita."
      toast.error(message)
    } finally {
      setSavingIncomeId(null)
    }
  }

  async function handleAddTag() {
    if (!token || newTagName.trim().length < 2) {
      toast.error("Nome da tag precisa ter pelo menos 2 caracteres.")
      return
    }
    try {
      const payload = {
        name: newTagName.trim(),
        type: newTagType,
      }
      const created = await apiFetch<ApiTag>("/tags", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      })
      setTags((prev) => [created, ...prev])
      setNewTagName("")
      toast.success("Tag criada com sucesso!")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao criar tag."
      toast.error(message)
    }
  }

  async function handleDeleteTag(tagId: string) {
    if (!token) return
    try {
      await apiFetch(`/tags/${tagId}`, {
        method: "DELETE",
        token,
      })
      setTags((prev) => prev.filter((tag) => tag.id !== tagId))
      toast.success("Tag excluída com sucesso!")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao excluir tag."
      toast.error(message)
    }
  }

  function startEditTag(tagId: string) {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) return
    setEditingTagId(tagId)
    setEditingTagName(tag.name)
  }

  async function handleUpdateTag() {
    if (!token || !editingTagId || editingTagName.trim().length < 2) {
      toast.error("Nome da tag precisa ter pelo menos 2 caracteres.")
      return
    }
    try {
      await apiFetch(`/tags/${editingTagId}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ name: editingTagName.trim() }),
      })
      setTags((prev) =>
        prev.map((tag) =>
          tag.id === editingTagId ? { ...tag, name: editingTagName.trim() } : tag
        )
      )
      setEditingTagId(null)
      setEditingTagName("")
      toast.success("Tag atualizada com sucesso!")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao atualizar tag."
      toast.error(message)
    }
  }

  function cancelEditTag() {
    setEditingTagId(null)
    setEditingTagName("")
  }

  async function handleAddCreditor() {
    if (!token || newCreditorName.trim().length < 2) {
      toast.error("Nome do credor precisa ter pelo menos 2 caracteres.")
      return
    }
    try {
      const payload = {
        name: newCreditorName.trim(),
        phone: newCreditorPhone.trim() || null,
        email: newCreditorEmail.trim() || null,
      }
      const created = await apiFetch<ApiCreditor>("/creditors", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      })
      const newCreditor = { ...created, totalAmount: 0, paidAmount: 0, unpaidAmount: 0, isPaidOff: false, expenseCount: 0 }
      setAllCreditors((prev) => [newCreditor, ...prev])
      setNewCreditorName("")
      setNewCreditorPhone("")
      setNewCreditorEmail("")
      setIsCreditorDialogOpen(false)
      toast.success("Credor criado com sucesso!")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao criar credor."
      toast.error(message)
    }
  }

  async function handleAiAnalysis() {
    if (!token) return
    setIsLoadingAi(true)
    setAiAnalysis("")
    try {
      const monthNum = Number(aiMonth)
      const yearNum = Number(aiYear)

      const monthIncomes = incomes.filter((i) => {
        const d = new Date(i.date)
        return d.getMonth() + 1 === monthNum && d.getFullYear() === yearNum
      })
      const monthExpenses = expenses.filter((e) => {
        const d = new Date(e.date)
        return d.getMonth() + 1 === monthNum && d.getFullYear() === yearNum
      })
      const monthCreditors = allCreditors.map((c) => {
        const cExpenses = monthExpenses.filter((e) => e.creditorId === c.id)
        const total = cExpenses.reduce((s, e) => s + Number(e.amount), 0)
        const paid = cExpenses.filter((e) => e.isPaid).reduce((s, e) => s + Number(e.amount), 0)
        return { name: c.name, totalAmount: total, paidAmount: paid, unpaidAmount: total - paid }
      }).filter((c) => c.totalAmount > 0)

      const payload = {
        month: monthNum,
        year: yearNum,
        totalIncome: monthIncomes.reduce((s, i) => s + Number(i.amount), 0),
        totalExpense: monthExpenses.reduce((s, e) => s + Number(e.amount), 0),
        incomes: monthIncomes.map((i) => ({
          source: i.source,
          amount: Number(i.amount),
          tag: i.tagId ? tagById.get(i.tagId)?.name : undefined,
        })),
        expenses: monthExpenses.map((e) => ({
          item: e.item,
          amount: Number(e.amount),
          tag: e.tagId ? tagById.get(e.tagId)?.name : undefined,
          creditor: e.creditorId ? allCreditors.find((c) => c.id === e.creditorId)?.name : undefined,
          isPaid: e.isPaid,
        })),
        creditors: monthCreditors,
      }

      const { result } = await apiFetch<{ result: string }>("/ai/analyze", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      })
      setAiAnalysis(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao analisar dados."
      toast.error(message)
    } finally {
      setIsLoadingAi(false)
    }
  }

  async function handleDeleteCreditor(creditorId: string) {
    if (!token) return
    try {
      await apiFetch(`/creditors/${creditorId}`, {
        method: "DELETE",
        token,
      })
      setCreditors((prev) => prev.filter((creditor) => creditor.id !== creditorId))
      setAllCreditors((prev) => prev.filter((creditor) => creditor.id !== creditorId))
      toast.success("Credor excluído com sucesso!")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao excluir credor."
      toast.error(message)
    }
  }

  async function applyGroupUpdate(applyAll: boolean) {
    if (!pendingGroupUpdate || !token) return
    const { groupId, expenseId, payload } = pendingGroupUpdate
    setSavingRowId(expenseId)
    setPendingGroupUpdate(null)
    try {
      if (applyAll) {
        await apiFetch(`/expenses/group/${groupId}`, {
          method: "PUT",
          token,
          body: JSON.stringify(payload),
        })
        setExpenses((prev) =>
          prev.map((e) => (e.installmentGroupId === groupId ? { ...e, ...payload } : e))
        )
      } else {
        await apiFetch(`/expenses/${expenseId}`, {
          method: "PUT",
          token,
          body: JSON.stringify(payload),
        })
        updateExpenseLocal(expenseId, payload)
      }
      fetchCreditors(creditorFilterMonth, creditorFilterYear)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar."
      toast.error(message)
    } finally {
      setSavingRowId(null)
    }
  }

  async function handleOpenCreditor(creditorId: string) {
    if (!token) return
    setIsLoadingCreditorDetails(true)
    setIsCreditorDetailsOpen(true)
    try {
      const details = await apiFetch<ApiCreditorDetails>(`/creditors/${creditorId}`, { token })
      setCreditorDetails(details)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar detalhes."
      toast.error(message)
      setIsCreditorDetailsOpen(false)
    } finally {
      setIsLoadingCreditorDetails(false)
    }
  }

  async function handleAddInstallment(monthIndex: number) {
    if (!token) return
    const monthKey = `${selectedYearNumber}-${monthIndex}`
    setSavingRowId(monthKey)
    try {
      const startDate = new Date(selectedYearNumber, monthIndex, 1).toISOString()
      const payload = {
        item: installmentItem || "Compra parcelada",
        amount: Number(installmentAmount) || 1,
        startDate,
        totalInstallments: installmentMonths,
        tagId: expenseTags[0]?.id,
        creditorId: installmentCreditorId && installmentCreditorId !== "none" ? installmentCreditorId : null,
        isPaid: false,
      }
      const result = await apiFetch<{ groupId: string; count: number }>("/expenses/installments", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      })

      setIsInstallmentDialogOpen(false)
      setSelectedMonthForInstallment(null)
      setInstallmentMonths(1)
      setInstallmentItem("")
      setInstallmentAmount("")
      setInstallmentCreditorId("")

      toast.success(`${result.count} parcelas criadas com sucesso!`)

      setExpenses([])
      const [incomesRes, expensesRes, creditorsRes] = await Promise.all([
        apiFetch<ApiIncome[]>("/incomes", { token }),
        apiFetch<ApiExpense[]>("/expenses", { token }),
        apiFetch<ApiCreditor[]>(`/creditors/summary?month=${creditorFilterMonth}&year=${creditorFilterYear}`, { token }),
      ])
      setIncomes(incomesRes)
      setExpenses(expensesRes)
      setCreditors(creditorsRes)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao criar parcelas."
      toast.error(message)
    } finally {
      setSavingRowId(null)
    }
  }

  const availableYears = React.useMemo(() => {
    const years = new Set<number>()
    for (const inc of incomes) years.add(new Date(inc.date).getFullYear())
    for (const exp of expenses) years.add(new Date(exp.date).getFullYear())
    years.add(currentYear)
    years.add(currentYear + 1)
    return Array.from(years).sort((a, b) => b - a)
  }, [incomes, expenses, currentYear])

  React.useEffect(() => {
    if (!availableYears.length) return
    if (!availableYears.includes(Number(selectedYear))) {
      setSelectedYear(String(availableYears[0]))
    }
  }, [availableYears, selectedYear])

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Delete" || event.key === "Backspace") {
        if (editingCell) return
        if (selectedExpenseIds.size === 0) return
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement
        ) {
          return
        }
        event.preventDefault()
        handleDeleteSelected()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedExpenseIds, editingCell, handleDeleteSelected])

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Delete" || event.key === "Backspace") {
        if (editingIncomeCell) return
        if (selectedIncomeIds.size === 0) return
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement
        ) {
          return
        }
        event.preventDefault()
        handleDeleteIncomeSelected()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedIncomeIds, editingIncomeCell, handleDeleteIncomeSelected])

  const selectedYearNumber = Number(selectedYear)

  const monthCards: MonthCardData[] = React.useMemo(() => {
    const incomeByMonth = new Array<number>(12).fill(0)
    const expenseByMonth = new Array<number>(12).fill(0)

    for (const inc of incomes) {
      const d = new Date(inc.date)
      if (d.getFullYear() !== selectedYearNumber) continue
      incomeByMonth[d.getMonth()] += toNumber(inc.amount)
    }

    for (const exp of expenses) {
      const d = new Date(exp.date)
      if (d.getFullYear() !== selectedYearNumber) continue
      expenseByMonth[d.getMonth()] += toNumber(exp.amount)
    }

    return MONTHS.map((m, monthIndex) => {
      const q = getQuarter(monthIndex)
      const dotColor =
        q === 1
          ? "var(--color-chart-1)"
          : q === 2
            ? "var(--color-chart-2)"
            : q === 3
              ? "var(--color-chart-3)"
              : "var(--color-chart-4)"

      const isCurrentMonth =
        selectedYearNumber === currentYear && monthIndex === currentMonthIndex

      return {
        key: `${selectedYear}-${monthIndex}`,
        label: m.label,
        quarter: q,
        year: selectedYearNumber,
        income: incomeByMonth[monthIndex],
        expense: expenseByMonth[monthIndex],
        dotColor,
        isCurrentMonth,
      }
    })
  }, [incomes, expenses, selectedYearNumber, currentYear, currentMonthIndex])

  const monthlySpendData = React.useMemo(() => {
    const limitMonth =
      selectedYearNumber === currentYear ? currentMonthIndex : 11

    return monthCards
      .slice(0, limitMonth + 1)
      .map((m, idx) => ({ month: MONTHS[idx].short, gastos: m.expense, receitas: m.income }))
  }, [monthCards, selectedYearNumber, currentYear, currentMonthIndex])

  const [chartMonth, setChartMonth] = React.useState<string>(String(new Date().getMonth()))

  const { incomesData, incomesConfig, totalIncome } = React.useMemo(() => {
    const filterMonth = Number(chartMonth)
    const totals = new Map<string, number>()
    for (const inc of incomes) {
      const d = new Date(inc.date)
      if (d.getFullYear() !== selectedYearNumber) continue
      if (d.getMonth() !== filterMonth) continue
      const tagName = inc.tagId ? tagById.get(inc.tagId)?.name : undefined
      const key = tagName || inc.source || "Outros"
      totals.set(key, (totals.get(key) ?? 0) + toNumber(inc.amount))
    }

    const top = buildTopCategories(Array.from(totals.entries()), 4)
    const { data, config } = buildDonutData(top)
    const total = data.reduce((acc, item) => acc + item.value, 0)
    return { incomesData: data, incomesConfig: config, totalIncome: total }
  }, [incomes, tagById, selectedYearNumber, chartMonth])

  const { expensesData, expensesConfig, totalExpense } = React.useMemo(() => {
    const filterMonth = Number(chartMonth)
    const totals = new Map<string, number>()
    for (const exp of expenses) {
      const d = new Date(exp.date)
      if (d.getFullYear() !== selectedYearNumber) continue
      if (d.getMonth() !== filterMonth) continue
      const tagName = exp.tagId ? tagById.get(exp.tagId)?.name : undefined
      const key = tagName || exp.item || "Outros"
      totals.set(key, (totals.get(key) ?? 0) + toNumber(exp.amount))
    }

    const top = buildTopCategories(Array.from(totals.entries()), 4)
    const { data, config } = buildDonutData(top)
    const total = data.reduce((acc, item) => acc + item.value, 0)
    return { expensesData: data, expensesConfig: config, totalExpense: total }
  }, [expenses, tagById, selectedYearNumber, chartMonth])

  const expenseRows = React.useMemo(() => {
    const rows = expenses.filter((exp) => {
      const d = new Date(exp.date)
      if (d.getFullYear() !== selectedYearNumber) return false
      const q = getQuarter(d.getMonth())
      if (expenseQuarter === "all") return true
      return expenseQuarter === `q${q}`
    })

    return rows.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [expenses, selectedYearNumber, expenseQuarter])

  const incomeRows = React.useMemo(() => {
    const rows = incomes.filter((inc) => {
      const d = new Date(inc.date)
      if (d.getFullYear() !== selectedYearNumber) return false
      const q = getQuarter(d.getMonth())
      if (incomeQuarter === "all") return true
      return incomeQuarter === `q${q}`
    })

    return rows.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [incomes, selectedYearNumber, incomeQuarter])

  function handleSort(column: "item" | "amount" | "date" | "tagId" | "creditorId" | "isPaid") {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  function handleIncomeSort(column: "source" | "amount" | "date" | "tagId") {
    if (sortColumnIncome === column) {
      setSortDirectionIncome(sortDirectionIncome === "asc" ? "desc" : "asc")
    } else {
      setSortColumnIncome(column)
      setSortDirectionIncome("asc")
    }
  }

  const expenseRowsByMonth = React.useMemo(() => {
    const map = new Map<number, ApiExpense[]>()
    for (const row of expenseRows) {
      const monthIndex = new Date(row.date).getMonth()
      const list = map.get(monthIndex) ?? []
      list.push(row)
      map.set(monthIndex, list)
    }

    if (sortColumn) {
      for (const [monthIndex, rows] of map.entries()) {
        const sorted = [...rows].sort((a, b) => {
          let aVal: string | number | boolean
          let bVal: string | number | boolean

          if (sortColumn === "item") {
            aVal = a.item.toLowerCase()
            bVal = b.item.toLowerCase()
          } else if (sortColumn === "amount") {
            aVal = toNumber(a.amount)
            bVal = toNumber(b.amount)
          } else if (sortColumn === "date") {
            aVal = new Date(a.date).getTime()
            bVal = new Date(b.date).getTime()
          } else if (sortColumn === "tagId") {
            aVal = (a.tagId && tagById.get(a.tagId)?.name) || ""
            bVal = (b.tagId && tagById.get(b.tagId)?.name) || ""
          } else if (sortColumn === "creditorId") {
            aVal = (a.creditorId && creditors.find(c => c.id === a.creditorId)?.name) || ""
            bVal = (b.creditorId && creditors.find(c => c.id === b.creditorId)?.name) || ""
          } else {
            aVal = a.isPaid ? 1 : 0
            bVal = b.isPaid ? 1 : 0
          }

          if (aVal < bVal) return sortDirection === "asc" ? -1 : 1
          if (aVal > bVal) return sortDirection === "asc" ? 1 : -1
          return 0
        })
        map.set(monthIndex, sorted)
      }
    }

    return map
  }, [expenseRows, sortColumn, sortDirection, tagById, creditors])

  const incomeRowsByMonth = React.useMemo(() => {
    const map = new Map<number, ApiIncome[]>()
    for (const row of incomeRows) {
      const monthIndex = new Date(row.date).getMonth()
      const list = map.get(monthIndex) ?? []
      list.push(row)
      map.set(monthIndex, list)
    }

    if (sortColumnIncome) {
      for (const [monthIndex, rows] of map.entries()) {
        const sorted = [...rows].sort((a, b) => {
          let aVal: string | number
          let bVal: string | number

          if (sortColumnIncome === "source") {
            aVal = a.source.toLowerCase()
            bVal = b.source.toLowerCase()
          } else if (sortColumnIncome === "amount") {
            aVal = toNumber(a.amount)
            bVal = toNumber(b.amount)
          } else if (sortColumnIncome === "date") {
            aVal = new Date(a.date).getTime()
            bVal = new Date(b.date).getTime()
          } else {
            aVal = (a.tagId && tagById.get(a.tagId)?.name) || ""
            bVal = (b.tagId && tagById.get(b.tagId)?.name) || ""
          }

          if (aVal < bVal) return sortDirectionIncome === "asc" ? -1 : 1
          if (aVal > bVal) return sortDirectionIncome === "asc" ? 1 : -1
          return 0
        })
        map.set(monthIndex, sorted)
      }
    }

    return map
  }, [incomeRows, sortColumnIncome, sortDirectionIncome, tagById])

  const visibleExpenseIds = React.useMemo(() => {
    return new Set(expenseRows.map((row) => row.id))
  }, [expenseRows])

  const monthsWithInstallments = React.useMemo(() => {
    const months = new Set<number>()
    expenses.forEach((exp) => {
      if (exp.installmentGroupId) {
        const monthIndex = new Date(exp.date).getMonth()
        months.add(monthIndex)
      }
    })
    return months
  }, [expenses])

  const visibleIncomeIds = React.useMemo(() => {
    return new Set(incomeRows.map((row) => row.id))
  }, [incomeRows])

  React.useEffect(() => {
    setSelectedExpenseIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => {
        if (visibleExpenseIds.has(id)) next.add(id)
      })
      return next
    })
  }, [visibleExpenseIds])

  React.useEffect(() => {
    setSelectedIncomeIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => {
        if (visibleIncomeIds.has(id)) next.add(id)
      })
      return next
    })
  }, [visibleIncomeIds])

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-[1400px] px-6 py-10">
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-semibold tracking-tight">
                  Acompanhamento de financas pessoais
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Usuario:{" "}
                  <span className="font-medium text-foreground">
                    {user?.email}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ThemeSettingsModal />
                <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={() => setIsTagDialogOpen(true)}>
                      <Tag className="mr-2 size-4" />
                      Gerenciar Tags
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Gerenciar Tags</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="mb-2 block text-sm font-medium">
                            Nova Tag
                          </label>
                          <Input
                            placeholder="Nome da tag..."
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                handleAddTag()
                              }
                            }}
                          />
                        </div>
                        <div className="w-40">
                          <label className="mb-2 block text-sm font-medium">Tipo</label>
                          <Select value={newTagType} onValueChange={(v) => setNewTagType(v as "INCOME" | "EXPENSE")}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INCOME">Receita</SelectItem>
                              <SelectItem value="EXPENSE">Despesa</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end pb-0.5">
                          <Button onClick={handleAddTag}>
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h3 className="mb-3 text-lg font-semibold">Tags de Receita</h3>
                          <div className="flex flex-wrap gap-2">
                            {tags.filter((t) => t.type === "INCOME").length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhuma tag de receita cadastrada.</p>
                            ) : (
                              tags.filter((t) => t.type === "INCOME").map((tag) => (
                                <div
                                  key={tag.id}
                                  className="group flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 dark:bg-emerald-950"
                                >
                                  {editingTagId === tag.id ? (
                                    <>
                                      <Input
                                        className="h-7 w-32 rounded-full px-3 text-xs"
                                        value={editingTagName}
                                        onChange={(e) => setEditingTagName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault()
                                            handleUpdateTag()
                                          }
                                          if (e.key === "Escape") {
                                            e.preventDefault()
                                            cancelEditTag()
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <button
                                        onClick={handleUpdateTag}
                                        className="rounded-full p-1 hover:bg-emerald-200 dark:hover:bg-emerald-900"
                                      >
                                        <CheckCircle2 className="size-4 text-emerald-600" />
                                      </button>
                                      <button
                                        onClick={cancelEditTag}
                                        className="rounded-full p-1 hover:bg-emerald-200 dark:hover:bg-emerald-900"
                                      >
                                        <X className="size-4 text-emerald-600" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                        {tag.name}
                                      </span>
                                      <div className="hidden gap-1 group-hover:flex">
                                        <button
                                          onClick={() => startEditTag(tag.id)}
                                          className="rounded-full p-1 hover:bg-emerald-200 dark:hover:bg-emerald-900"
                                        >
                                          <Edit className="size-3 text-emerald-600" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteTag(tag.id)}
                                          className="rounded-full p-1 hover:bg-emerald-200 dark:hover:bg-emerald-900"
                                        >
                                          <Trash2 className="size-3 text-emerald-600" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div>
                          <h3 className="mb-3 text-lg font-semibold">Tags de Despesa</h3>
                          <div className="flex flex-wrap gap-2">
                            {tags.filter((t) => t.type === "EXPENSE").length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhuma tag de despesa cadastrada.</p>
                            ) : (
                              tags.filter((t) => t.type === "EXPENSE").map((tag) => (
                                <div
                                  key={tag.id}
                                  className="group flex items-center gap-2 rounded-full bg-red-100 px-4 py-2 dark:bg-red-950"
                                >
                                  {editingTagId === tag.id ? (
                                    <>
                                      <Input
                                        className="h-7 w-32 rounded-full px-3 text-xs"
                                        value={editingTagName}
                                        onChange={(e) => setEditingTagName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault()
                                            handleUpdateTag()
                                          }
                                          if (e.key === "Escape") {
                                            e.preventDefault()
                                            cancelEditTag()
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <button
                                        onClick={handleUpdateTag}
                                        className="rounded-full p-1 hover:bg-red-200 dark:hover:bg-red-900"
                                      >
                                        <CheckCircle2 className="size-4 text-red-600" />
                                      </button>
                                      <button
                                        onClick={cancelEditTag}
                                        className="rounded-full p-1 hover:bg-red-200 dark:hover:bg-red-900"
                                      >
                                        <X className="size-4 text-red-600" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-sm font-medium text-red-700 dark:text-red-300">
                                        {tag.name}
                                      </span>
                                      <div className="hidden gap-1 group-hover:flex">
                                        <button
                                          onClick={() => startEditTag(tag.id)}
                                          className="rounded-full p-1 hover:bg-red-200 dark:hover:bg-red-900"
                                        >
                                          <Edit className="size-3 text-red-600" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteTag(tag.id)}
                                          className="rounded-full p-1 hover:bg-red-200 dark:hover:bg-red-900"
                                        >
                                          <Trash2 className="size-3 text-red-600" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" onClick={logout}>
                  Sair
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Receitas e despesas por mês
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={spendConfig}
                    className="aspect-auto h-[280px] w-full"
                  >
                    <AreaChart data={monthlySpendData} margin={{ left: 12, right: 12 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="line"
                            formatter={(value) => (
                              <span className="text-foreground font-mono font-medium tabular-nums">
                                {formatBRL(Number(value))}
                              </span>
                            )}
                          />
                        }
                      />
                      <Area
                        dataKey="receitas"
                        type="monotone"
                        stroke="var(--color-receitas)"
                        fill="var(--color-receitas)"
                        fillOpacity={0.18}
                        strokeWidth={2}
                      />
                      <Area
                        dataKey="gastos"
                        type="monotone"
                        stroke="var(--color-gastos)"
                        fill="var(--color-gastos)"
                        fillOpacity={0.18}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card className="lg:col-span-3">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">Receitas por categoria</CardTitle>
                    <Select value={chartMonth} onValueChange={setChartMonth}>
                      <SelectTrigger className="h-7 w-[110px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={i} value={String(i)}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ChartContainer
                    config={incomesConfig}
                    className="aspect-square h-[240px] w-full"
                  >
                    <PieChart>
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            nameKey="name"
                            formatter={(value) => (
                              <span className="text-foreground font-mono font-medium tabular-nums">
                                {formatBRL(Number(value))}
                              </span>
                            )}
                          />
                        }
                      />
                      <Pie
                        data={incomesData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={70}
                        outerRadius={100}
                        stroke="transparent"
                      >
                        <RechartsLabel
                          content={({ viewBox }) => {
                            if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
                            const cx = viewBox.cx as number
                            const cy = viewBox.cy as number
                            return (
                              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                                <tspan className="fill-foreground text-2xl font-semibold">
                                  {formatBRL(totalIncome)}
                                </tspan>
                                <tspan
                                  x={cx}
                                  y={cy + 22}
                                  className="fill-muted-foreground text-xs"
                                >
                                  Total
                                </tspan>
                              </text>
                            )
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <CompactLegend data={incomesData} config={incomesConfig} />
                </CardContent>
              </Card>

              <Card className="lg:col-span-3">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">Despesas por categoria</CardTitle>
                    <Select value={chartMonth} onValueChange={setChartMonth}>
                      <SelectTrigger className="h-7 w-[110px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={i} value={String(i)}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ChartContainer
                    config={expensesConfig}
                    className="aspect-square h-[240px] w-full"
                  >
                    <PieChart>
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            nameKey="name"
                            formatter={(value) => (
                              <span className="text-foreground font-mono font-medium tabular-nums">
                                {formatBRL(Number(value))}
                              </span>
                            )}
                          />
                        }
                      />
                      <Pie
                        data={expensesData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={70}
                        outerRadius={100}
                        stroke="transparent"
                      >
                        <RechartsLabel
                          content={({ viewBox }) => {
                            if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
                            const cx = viewBox.cx as number
                            const cy = viewBox.cy as number
                            return (
                              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                                <tspan className="fill-foreground text-2xl font-semibold">
                                  {formatBRL(totalExpense)}
                                </tspan>
                                <tspan
                                  x={cx}
                                  y={cy + 22}
                                  className="fill-muted-foreground text-xs"
                                >
                                  Total
                                </tspan>
                              </text>
                            )
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <CompactLegend data={expensesData} config={expensesConfig} />
                </CardContent>
              </Card>
            </div>

            <div className="pt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-semibold">Análise com IA</div>
                <div className="flex items-center gap-2">
                  <Select value={aiMonth} onValueChange={setAiMonth}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={aiYear} onValueChange={setAiYear}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAiAnalysis} disabled={isLoadingAi}>
                    {isLoadingAi ? "Analisando..." : "Analisar"}
                  </Button>
                </div>
              </div>
              {(aiAnalysis || isLoadingAi) && (
                <Card>
                  <CardContent className="p-4">
                    {isLoadingAi ? (
                      <p className="text-sm text-muted-foreground">Gerando análise...</p>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{aiAnalysis}</div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="pt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-semibold">Credores</div>
                <div className="flex items-center gap-2">
                  <Select value={creditorFilterMonth} onValueChange={setCreditorFilterMonth}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={creditorFilterYear} onValueChange={setCreditorFilterYear}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Dialog open={isCreditorDialogOpen} onOpenChange={setIsCreditorDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={() => setIsCreditorDialogOpen(true)}>
                      <Plus className="mr-2 size-4" />
                      Novo Credor
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Credor</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium">Nome</label>
                        <Input
                          placeholder="Ex: João Silva"
                          value={newCreditorName}
                          onChange={(e) => setNewCreditorName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium">Telefone</label>
                        <Input
                          placeholder="Ex: (11) 98765-4321"
                          value={newCreditorPhone}
                          onChange={(e) => setNewCreditorPhone(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium">Email</label>
                        <Input
                          type="email"
                          placeholder="Ex: joao@email.com"
                          value={newCreditorEmail}
                          onChange={(e) => setNewCreditorEmail(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsCreditorDialogOpen(false)
                            setNewCreditorName("")
                            setNewCreditorPhone("")
                            setNewCreditorEmail("")
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleAddCreditor}
                          disabled={!newCreditorName.trim()}
                        >
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {creditors.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum credor cadastrado.
                    </CardContent>
                  </Card>
                ) : (
                  creditors.map((creditor) => (
                    <Card
                      key={creditor.id}
                      className={[
                        "cursor-pointer transition-shadow hover:shadow-md",
                        creditor.isPaidOff ? "" : "border-orange-200 dark:border-orange-900",
                      ].join(" ")}
                      onClick={() => handleOpenCreditor(creditor.id)}
                    >
                      <CardContent className="px-3 py-2">
                        <div className="mb-2 flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">{creditor.name}</h3>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              {creditor.phone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="size-3" />
                                  {creditor.phone}
                                </div>
                              )}
                              {creditor.email && (
                                <div className="flex items-center gap-1">
                                  <Mail className="size-3" />
                                  {creditor.email}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCreditor(creditor.id) }}
                            className="rounded-full p-0.5 hover:bg-muted"
                            title="Excluir credor"
                          >
                            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-medium tabular-nums">{formatBRL(creditor.totalAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Pago:</span>
                            <span className="font-medium tabular-nums text-emerald-600">{formatBRL(creditor.paidAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Restante:</span>
                            <span className={`font-semibold tabular-nums ${creditor.isPaidOff ? "text-emerald-600" : "text-red-600"}`}>
                              {formatBRL(creditor.unpaidAmount)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            {creditor.isPaidOff ? (
                              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                <CheckCircle2 className="size-3" />
                                Quitado
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                                <AlertCircle className="size-3" />
                                Pendente
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="text-lg font-semibold">Meses</div>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">Todos os meses</TabsTrigger>
                  <TabsTrigger value="q1">1º tri</TabsTrigger>
                  <TabsTrigger value="q2">2º tri</TabsTrigger>
                  <TabsTrigger value="q3">3º tri</TabsTrigger>
                  <TabsTrigger value="q4">4º tri</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
                    {monthCards.map((month) => {
                      const monthIndex = Number(month.key.split('-')[1])
                      return (
                        <MonthCard
                          key={month.key}
                          month={month}
                          hasInstallments={monthsWithInstallments.has(monthIndex)}
                        />
                      )
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="q1" className="pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
                    {monthCards
                      .filter((m) => m.quarter === 1)
                      .map((month) => {
                        const monthIndex = Number(month.key.split('-')[1])
                        return (
                          <MonthCard
                            key={month.key}
                            month={month}
                            hasInstallments={monthsWithInstallments.has(monthIndex)}
                          />
                        )
                      })}
                  </div>
                </TabsContent>

                <TabsContent value="q2" className="pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
                    {monthCards
                      .filter((m) => m.quarter === 2)
                      .map((month) => {
                        const monthIndex = Number(month.key.split('-')[1])
                        return (
                          <MonthCard
                            key={month.key}
                            month={month}
                            hasInstallments={monthsWithInstallments.has(monthIndex)}
                          />
                        )
                      })}
                  </div>
                </TabsContent>

                <TabsContent value="q3" className="pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
                    {monthCards
                      .filter((m) => m.quarter === 3)
                      .map((month) => {
                        const monthIndex = Number(month.key.split('-')[1])
                        return (
                          <MonthCard
                            key={month.key}
                            month={month}
                            hasInstallments={monthsWithInstallments.has(monthIndex)}
                          />
                        )
                      })}
                  </div>
                </TabsContent>

                <TabsContent value="q4" className="pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
                    {monthCards
                      .filter((m) => m.quarter === 4)
                      .map((month) => {
                        const monthIndex = Number(month.key.split('-')[1])
                        return (
                          <MonthCard
                            key={month.key}
                            month={month}
                            hasInstallments={monthsWithInstallments.has(monthIndex)}
                          />
                        )
                      })}
                  </div>
                </TabsContent>
              </Tabs>

              {isLoadingData ? (
                <div className="pt-3 text-sm text-muted-foreground">
                  Carregando dados...
                </div>
              ) : null}
            </div>

            <div className="pt-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-lg font-semibold">Receitas</div>
                <Tabs value={incomeQuarter} onValueChange={setIncomeQuarter}>
                  <TabsList>
                    <TabsTrigger value="all">Todos os meses</TabsTrigger>
                    <TabsTrigger value="q1">1º tri</TabsTrigger>
                    <TabsTrigger value="q2">2º tri</TabsTrigger>
                    <TabsTrigger value="q3">3º tri</TabsTrigger>
                    <TabsTrigger value="q4">4º tri</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {(() => {
                const visibleMonths = MONTHS.map((month, monthIndex) => {
                  const quarterLabel = getQuarter(monthIndex)
                  const isVisibleQuarter =
                    incomeQuarter === "all" || incomeQuarter === `q${quarterLabel}`
                  return { month, monthIndex, quarterLabel, isVisibleQuarter }
                }).filter(({ isVisibleQuarter }) => isVisibleQuarter)

                if (visibleMonths.length === 0) {
                  return (
                    <Card>
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        Nenhuma receita encontrada para este periodo.
                      </CardContent>
                    </Card>
                  )
                }

                return visibleMonths.map(({ month, monthIndex }) => {
                  const rows = incomeRowsByMonth.get(monthIndex) ?? []
                  const monthIds = rows.map((row) => row.id)
                  const allSelected = rows.length > 0 && monthIds.every((id) =>
                    selectedIncomeIds.has(id)
                  )
                  const someSelected = monthIds.some((id) =>
                    selectedIncomeIds.has(id)
                  )
                  const monthKey = `${selectedYearNumber}-${monthIndex}`

                  return (
                    <Card key={month.label} className="mb-4">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">
                            {month.label}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            {someSelected && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteIncomeSelected(monthIds)}
                                disabled={savingIncomeId === "delete"}
                              >
                                {savingIncomeId === "delete" ? "Excluindo..." : "Excluir selecionadas"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddIncome(monthIndex)}
                              disabled={savingIncomeId === monthKey}
                            >
                              {savingIncomeId === monthKey ? "Adicionando..." : "Adicionar"}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="pl-6">
                                {rows.length > 0 && (
                                  <Checkbox
                                    checked={
                                      allSelected ? true : someSelected ? "indeterminate" : false
                                    }
                                    onCheckedChange={(checked) => {
                                      setSelectedIncomeIds((prev) => {
                                        const next = new Set(prev)
                                        if (checked) {
                                          monthIds.forEach((id) => next.add(id))
                                        } else {
                                          monthIds.forEach((id) => next.delete(id))
                                        }
                                        return next
                                      })
                                    }}
                                  />
                                )}
                              </TableHead>
                              <SortableIncomeHeader
                                column="source"
                                currentSort={sortColumnIncome}
                                sortDirection={sortDirectionIncome}
                                onSort={handleIncomeSort}
                                icon={FileText}
                              >
                                Fonte
                              </SortableIncomeHeader>
                              <SortableIncomeHeader
                                column="amount"
                                currentSort={sortColumnIncome}
                                sortDirection={sortDirectionIncome}
                                onSort={handleIncomeSort}
                                icon={DollarSign}
                              >
                                Valor
                              </SortableIncomeHeader>
                              <SortableIncomeHeader
                                column="tagId"
                                currentSort={sortColumnIncome}
                                sortDirection={sortDirectionIncome}
                                onSort={handleIncomeSort}
                                icon={Tag}
                              >
                                Tag
                              </SortableIncomeHeader>
                              <SortableIncomeHeader
                                column="date"
                                currentSort={sortColumnIncome}
                                sortDirection={sortDirectionIncome}
                                onSort={handleIncomeSort}
                                icon={Calendar}
                              >
                                Data
                              </SortableIncomeHeader>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="px-6 py-6 text-center text-sm text-muted-foreground">
                                  Nenhuma receita neste mes. Clique em "Adicionar" para criar uma.
                                </TableCell>
                              </TableRow>
                            ) : (
                              rows.map((row) => {
                                const isEditing = (field: "source" | "amount" | "date" | "tagId") =>
                                  editingIncomeCell?.id === row.id && editingIncomeCell.field === field
                                const draft = draftsIncome[row.id]
                                const sourceValue = (draft?.source ?? row.source) as string
                                const amountValue = String(draft?.amount ?? row.amount)
                                const dateValue = formatDateInput(
                                  (draft?.date ?? row.date) as string
                                )
                                const tagValue = (draft?.tagId ?? row.tagId) as string | null
                                const tagLabel =
                                  (row.tagId && tagById.get(row.tagId)?.name) || "Sem tag"

                                return (
                                  <TableRow key={row.id}>
                                    <TableCell className="pl-6">
                                      <Checkbox
                                        checked={selectedIncomeIds.has(row.id)}
                                        onCheckedChange={(checked) => {
                                          setSelectedIncomeIds((prev) => {
                                            const next = new Set(prev)
                                            if (checked) next.add(row.id)
                                            else next.delete(row.id)
                                            return next
                                          })
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell onClick={() => startIncomeEdit(row.id, "source")}>
                                      {isEditing("source") ? (
                                        <Input
                                          autoFocus
                                          value={sourceValue}
                                          onChange={(event) =>
                                            setDraftsIncome((prev) => ({
                                              ...prev,
                                              [row.id]: {
                                                ...prev[row.id],
                                                source: event.target.value,
                                              },
                                            }))
                                          }
                                          onBlur={(event) => saveIncomeField(row.id, "source", event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              saveIncomeField(
                                                row.id,
                                                "source",
                                                (event.target as HTMLInputElement).value
                                              )
                                            }
                                            if (event.key === "Escape") {
                                              setEditingIncomeCell(null)
                                            }
                                          }}
                                        />
                                      ) : (
                                        <span className="cursor-text">{row.source}</span>
                                      )}
                                    </TableCell>
                                    <TableCell onClick={() => startIncomeEdit(row.id, "amount")}>
                                      {isEditing("amount") ? (
                                        <Input
                                          autoFocus
                                          type="number"
                                          step="0.01"
                                          value={amountValue}
                                          onChange={(event) =>
                                            setDraftsIncome((prev) => ({
                                              ...prev,
                                              [row.id]: {
                                                ...prev[row.id],
                                                amount: event.target.value,
                                              },
                                            }))
                                          }
                                          onBlur={(event) => saveIncomeField(row.id, "amount", event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              saveIncomeField(
                                                row.id,
                                                "amount",
                                                (event.target as HTMLInputElement).value
                                              )
                                            }
                                            if (event.key === "Escape") {
                                              setEditingIncomeCell(null)
                                            }
                                          }}
                                        />
                                      ) : (
                                        <span className="cursor-text">{formatBRL(toNumber(row.amount))}</span>
                                      )}
                                    </TableCell>
                                    <TableCell onClick={() => startIncomeEdit(row.id, "tagId")}>
                                      {isEditing("tagId") ? (
                                        <Select
                                          value={tagValue ?? "none"}
                                          onValueChange={(value) => saveIncomeField(row.id, "tagId", value)}
                                        >
                                          <SelectTrigger className="h-8">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">Sem tag</SelectItem>
                                            {incomeTags.map((tag) => (
                                              <SelectItem key={tag.id} value={tag.id}>
                                                {tag.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <span className="cursor-text">{tagLabel}</span>
                                      )}
                                    </TableCell>
                                    <TableCell onClick={() => startIncomeEdit(row.id, "date")}>
                                      {isEditing("date") ? (
                                        <Input
                                          autoFocus
                                          type="date"
                                          value={dateValue}
                                          onChange={(event) =>
                                            setDraftsIncome((prev) => ({
                                              ...prev,
                                              [row.id]: {
                                                ...prev[row.id],
                                                date: event.target.value,
                                              },
                                            }))
                                          }
                                          onBlur={(event) => saveIncomeField(row.id, "date", event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              saveIncomeField(
                                                row.id,
                                                "date",
                                                (event.target as HTMLInputElement).value
                                              )
                                            }
                                            if (event.key === "Escape") {
                                              setEditingIncomeCell(null)
                                            }
                                          }}
                                        />
                                      ) : (
                                        <span className="cursor-text">{formatDateDisplay(row.date)}</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )
                })
              })()}
            </div>

            <div className="pt-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-lg font-semibold">Despesas</div>
                <Tabs value={expenseQuarter} onValueChange={setExpenseQuarter}>
                  <TabsList>
                    <TabsTrigger value="all">Todos os meses</TabsTrigger>
                    <TabsTrigger value="q1">1º tri</TabsTrigger>
                    <TabsTrigger value="q2">2º tri</TabsTrigger>
                    <TabsTrigger value="q3">3º tri</TabsTrigger>
                    <TabsTrigger value="q4">4º tri</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {(() => {
                const visibleMonths = MONTHS.map((month, monthIndex) => {
                  const quarterLabel = getQuarter(monthIndex)
                  const isVisibleQuarter =
                    expenseQuarter === "all" || expenseQuarter === `q${quarterLabel}`
                  return { month, monthIndex, quarterLabel, isVisibleQuarter }
                }).filter(({ isVisibleQuarter }) => isVisibleQuarter)

                if (visibleMonths.length === 0) {
                  return (
                    <Card>
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        Nenhuma despesa encontrada para este periodo.
                      </CardContent>
                    </Card>
                  )
                }

                return visibleMonths.map(({ month, monthIndex }) => {
                  const rows = expenseRowsByMonth.get(monthIndex) ?? []
                  const monthIds = rows.map((row) => row.id)
                  const allSelected = rows.length > 0 && monthIds.every((id) =>
                    selectedExpenseIds.has(id)
                  )
                  const someSelected = monthIds.some((id) =>
                    selectedExpenseIds.has(id)
                  )
                  const monthKey = `${selectedYearNumber}-${monthIndex}`

                  return (
                    <Card key={month.label} className="mb-4">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">
                            {month.label}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            {someSelected && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteSelected(monthIds)}
                                disabled={savingRowId === "delete"}
                              >
                                {savingRowId === "delete" ? "Excluindo..." : "Excluir selecionadas"}
                              </Button>
                            )}
                            <Dialog open={isInstallmentDialogOpen} onOpenChange={setIsInstallmentDialogOpen}>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setSelectedMonthForInstallment(monthIndex)
                                    setIsInstallmentDialogOpen(true)
                                  }}
                                  disabled={savingRowId === monthKey}
                                >
                                  {savingRowId === monthKey ? "Adicionando..." : "Compra Parcelada"}
                                </Button>
                              </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Adicionar Compra Parcelada</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <label className="mb-2 block text-sm font-medium">
                              Nome da Compra
                            </label>
                            <Input
                              placeholder="Ex: TV 55 polegadas"
                              value={installmentItem}
                              onChange={(e) => setInstallmentItem(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium">
                              Valor de Cada Parcela
                            </label>
                            <Input
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="Ex: 150.00"
                              value={installmentAmount}
                              onChange={(e) => setInstallmentAmount(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium">
                              Credor (Opcional)
                            </label>
                            <Select value={installmentCreditorId} onValueChange={setInstallmentCreditorId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um credor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem credor</SelectItem>
                                {allCreditors.map((creditor) => (
                                  <SelectItem key={creditor.id} value={creditor.id}>
                                    {creditor.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-medium">
                              Número de Parcelas
                            </label>
                            <Input
                              type="number"
                              min="1"
                              max="60"
                              value={installmentMonths}
                              onChange={(e) => setInstallmentMonths(Number(e.target.value))}
                              placeholder="Ex: 12"
                            />
                          </div>
                          <div className="rounded-lg bg-muted p-3">
                            <p className="text-sm font-medium">Resumo:</p>
                            <p className="text-sm text-muted-foreground">
                              {installmentMonths}x de {installmentAmount ? formatBRL(Number(installmentAmount)) : 'R$ 0,00'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Total: {installmentAmount && installmentMonths ? formatBRL(Number(installmentAmount) * installmentMonths) : 'R$ 0,00'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Começando em {selectedMonthForInstallment !== null ? MONTHS[selectedMonthForInstallment].label : ''} de {selectedYearNumber}
                            </p>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setIsInstallmentDialogOpen(false)
                                setInstallmentMonths(1)
                                setInstallmentItem("")
                                setInstallmentAmount("")
                              }}
                            >
                              Cancelar
                            </Button>
                            <Button
                              onClick={() => {
                                if (selectedMonthForInstallment !== null) {
                                  handleAddInstallment(selectedMonthForInstallment)
                                }
                              }}
                              disabled={!installmentItem || !installmentAmount || installmentMonths < 1}
                            >
                              Criar Parcelas
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                            </Dialog>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddExpense(monthIndex)}
                              disabled={savingRowId === monthKey}
                            >
                              {savingRowId === monthKey ? "Adicionando..." : "Adicionar"}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="pl-6">
                                {rows.length > 0 && (
                                  <Checkbox
                                    checked={
                                      allSelected ? true : someSelected ? "indeterminate" : false
                                    }
                                    onCheckedChange={(checked) => {
                                      setSelectedExpenseIds((prev) => {
                                        const next = new Set(prev)
                                        if (checked) {
                                          monthIds.forEach((id) => next.add(id))
                                        } else {
                                          monthIds.forEach((id) => next.delete(id))
                                        }
                                        return next
                                      })
                                    }}
                                  />
                                )}
                              </TableHead>
                              <SortableHeader
                                column="item"
                                currentSort={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                                icon={FileText}
                              >
                                Item
                              </SortableHeader>
                              <SortableHeader
                                column="amount"
                                currentSort={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                                icon={DollarSign}
                              >
                                Valor
                              </SortableHeader>
                              <SortableHeader
                                column="tagId"
                                currentSort={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                                icon={Tag}
                              >
                                Tag
                              </SortableHeader>
                              <SortableHeader
                                column="creditorId"
                                currentSort={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                                icon={UserCircle}
                              >
                                Credor
                              </SortableHeader>
                              <SortableHeader
                                column="date"
                                currentSort={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                                icon={Calendar}
                              >
                                Data
                              </SortableHeader>
                              <SortableHeader
                                column="isPaid"
                                currentSort={sortColumn}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                                icon={CheckCircle}
                                align="right"
                              >
                                Status
                              </SortableHeader>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="px-6 py-6 text-center text-sm text-muted-foreground">
                                  Nenhuma despesa neste mes. Clique em "Adicionar" para criar uma.
                                </TableCell>
                              </TableRow>
                            ) : (
                              rows.map((row) => {
                                const isEditing = (field: "item" | "amount" | "date" | "tagId" | "creditorId") =>
                                  editingCell?.id === row.id && editingCell.field === field
                                const draft = drafts[row.id]
                                const itemValue = (draft?.item ?? row.item) as string
                                const amountValue = String(draft?.amount ?? row.amount)
                                const dateValue = formatDateInput(
                                  (draft?.date ?? row.date) as string
                                )
                                const tagValue = (draft?.tagId ?? row.tagId) as string | null
                                const tagLabel =
                                  (row.tagId && tagById.get(row.tagId)?.name) || "Sem tag"

                                return (
                                  <TableRow key={row.id}>
                                    <TableCell className="pl-6">
                                      <Checkbox
                                        checked={selectedExpenseIds.has(row.id)}
                                        onCheckedChange={(checked) => {
                                          setSelectedExpenseIds((prev) => {
                                            const next = new Set(prev)
                                            if (checked) next.add(row.id)
                                            else next.delete(row.id)
                                            return next
                                          })
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell onClick={() => startEdit(row.id, "item")}>
                                      <div className="group flex items-center gap-2">
                                        {isEditing("item") ? (
                                          <Input
                                            autoFocus
                                            value={itemValue}
                                            onChange={(event) =>
                                              setDrafts((prev) => ({
                                                ...prev,
                                                [row.id]: {
                                                  ...prev[row.id],
                                                  item: event.target.value,
                                                },
                                              }))
                                            }
                                            onBlur={(event) => saveField(row.id, "item", event.target.value)}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter") {
                                                saveField(
                                                  row.id,
                                                  "item",
                                                  (event.target as HTMLInputElement).value
                                                )
                                              }
                                              if (event.key === "Escape") {
                                                setEditingCell(null)
                                              }
                                            }}
                                          />
                                        ) : (
                                          <span className="cursor-text">{row.item}</span>
                                        )}
                                        {row.installmentGroupId && (
                                          <div className="flex items-center gap-2">
                                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                              {row.installmentNumber}/{row.installmentTotal}
                                            </span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                if (row.installmentGroupId) {
                                                  setPendingDeleteGroupId(row.installmentGroupId)
                                                }
                                              }}
                                              className="rounded-full p-1 hover:bg-red-200 dark:hover:bg-red-900"
                                              title="Excluir todas as parcelas"
                                            >
                                              <Trash2 className="size-3 text-red-600" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell onClick={() => startEdit(row.id, "amount")}>
                                      {isEditing("amount") ? (
                                        <Input
                                          autoFocus
                                          type="number"
                                          step="0.01"
                                          value={amountValue}
                                          onChange={(event) =>
                                            setDrafts((prev) => ({
                                              ...prev,
                                              [row.id]: {
                                                ...prev[row.id],
                                                amount: event.target.value,
                                              },
                                            }))
                                          }
                                          onBlur={(event) => saveField(row.id, "amount", event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              saveField(
                                                row.id,
                                                "amount",
                                                (event.target as HTMLInputElement).value
                                              )
                                            }
                                            if (event.key === "Escape") {
                                              setEditingCell(null)
                                            }
                                          }}
                                        />
                                      ) : (
                                        <span className="cursor-text">{formatBRL(toNumber(row.amount))}</span>
                                      )}
                                    </TableCell>
                                    <TableCell onClick={() => startEdit(row.id, "tagId")}>
                                      {isEditing("tagId") ? (
                                        <Select
                                          value={tagValue ?? "none"}
                                          onValueChange={(value) => saveField(row.id, "tagId", value)}
                                        >
                                          <SelectTrigger className="h-8">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">Sem tag</SelectItem>
                                            {expenseTags.map((tag) => (
                                              <SelectItem key={tag.id} value={tag.id}>
                                                {tag.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <span className="cursor-text">{tagLabel}</span>
                                      )}
                                    </TableCell>
                                    <TableCell onClick={() => startEdit(row.id, "creditorId")}>
                                      {isEditing("creditorId") ? (
                                        <Select
                                          value={(drafts[row.id]?.creditorId ?? row.creditorId) ?? "none"}
                                          onValueChange={(value) => saveField(row.id, "creditorId", value)}
                                        >
                                          <SelectTrigger className="h-8">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">Sem credor</SelectItem>
                                            {allCreditors.map((creditor) => (
                                              <SelectItem key={creditor.id} value={creditor.id}>
                                                {creditor.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <span className="cursor-text">
                                          {row.creditorId ? creditors.find(c => c.id === row.creditorId)?.name : "-"}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell onClick={() => startEdit(row.id, "date")}>
                                      {isEditing("date") ? (
                                        <Input
                                          autoFocus
                                          type="date"
                                          value={dateValue}
                                          onChange={(event) =>
                                            setDrafts((prev) => ({
                                              ...prev,
                                              [row.id]: {
                                                ...prev[row.id],
                                                date: event.target.value,
                                              },
                                            }))
                                          }
                                          onBlur={(event) => saveField(row.id, "date", event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              saveField(
                                                row.id,
                                                "date",
                                                (event.target as HTMLInputElement).value
                                              )
                                            }
                                            if (event.key === "Escape") {
                                              setEditingCell(null)
                                            }
                                          }}
                                        />
                                      ) : (
                                        <span className="cursor-text">{formatDateDisplay(row.date)}</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="pr-6 text-right">
                                      <button
                                        type="button"
                                        onClick={() => togglePaid(row.id, !row.isPaid)}
                                        className="inline-flex items-center gap-2 text-sm font-medium"
                                      >
                                        {row.isPaid ? (
                                          <CheckCircle2 className="size-4 text-emerald-400" />
                                        ) : (
                                          <AlertCircle className="size-4 text-red-400" />
                                        )}
                                        <span>{row.isPaid ? "Pago" : "Pendente"}</span>
                                      </button>
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      </div>
      <Dialog open={isCreditorDetailsOpen} onOpenChange={(open) => { setIsCreditorDetailsOpen(open); if (!open) setCreditorDetails(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{creditorDetails?.name ?? "Carregando..."}</DialogTitle>
          </DialogHeader>
          {isLoadingCreditorDetails ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando contas...</p>
          ) : creditorDetails?.expenses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma conta associada.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Pago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditorDetails?.expenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-sm">{exp.item}</TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {new Date(exp.date).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatBRL(Number(exp.amount))}</TableCell>
                      <TableCell className="text-center">
                        {exp.isPaid ? (
                          <CheckCircle2 className="mx-auto size-4 text-emerald-600" />
                        ) : (
                          <XCircle className="mx-auto size-4 text-red-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingGroupUpdate} onOpenChange={(open) => { if (!open) setPendingGroupUpdate(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar {pendingGroupUpdate?.field === "tagId" ? "tag" : "credor"}</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja aplicar essa alteração apenas nesta parcela ou em todas as parcelas do grupo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyGroupUpdate(false)}>
              Só esta parcela
            </AlertDialogAction>
            <AlertDialogAction onClick={() => applyGroupUpdate(true)}>
              Todas as parcelas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeleteGroupId} onOpenChange={(open) => { if (!open) setPendingDeleteGroupId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir todas as parcelas?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação irá remover todas as parcelas deste grupo permanentemente. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteGroupId) {
                  handleDeleteInstallmentGroup(pendingDeleteGroupId)
                  setPendingDeleteGroupId(null)
                }
              }}
            >
              Excluir todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthGuard>
  )
}
