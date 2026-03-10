"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { Spinner } from "@/components/ui/spinner"
import { useAuthContext } from "./auth-provider"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { token, isReady } = useAuthContext()

  useEffect(() => {
    if (!isReady) return
    if (!token) {
      router.replace("/login")
    }
  }, [isReady, token, router])

  if (!isReady || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return <>{children}</>
}
