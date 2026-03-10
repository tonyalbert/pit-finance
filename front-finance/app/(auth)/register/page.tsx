"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Wallet } from "lucide-react"

import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.")
      return
    }
    setIsLoading(true)
    try {
      await register(email, password)
      toast.success("Conta criada com sucesso.")
      router.push("/dashboard")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao criar conta."
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo decorativo */}
      <div className="relative hidden w-1/2 lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-500 via-emerald-500 to-emerald-600" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link href="/" className="flex items-center gap-2">
            <Wallet className="size-7" />
            <span className="text-xl font-bold">Pit Finance</span>
          </Link>
          <div>
            <h2 className="text-3xl font-bold leading-tight">
              Organize seu dinheiro<br />de forma inteligente.
            </h2>
            <p className="mt-4 max-w-md text-emerald-100/80">
              Crie sua conta em segundos e comece a ter uma visão clara de todas as suas finanças pessoais.
            </p>
          </div>
          <p className="text-sm text-emerald-100/50">&copy; {new Date().getFullYear()} Pit Finance</p>
        </div>
      </div>

      {/* Painel direito - formulário */}
      <div className="flex w-full flex-col items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="flex items-center gap-2">
              <Wallet className="size-6 text-emerald-500" />
              <span className="text-lg font-bold">Pit Finance</span>
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Crie sua conta</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Comece a organizar suas finanças agora mesmo.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Crie uma senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" type="submit" disabled={isLoading}>
              {isLoading ? <Spinner className="mr-2 size-4" /> : null}
              Criar conta
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link className="font-medium text-emerald-600 hover:text-emerald-500 hover:underline underline-offset-4" href="/login">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
