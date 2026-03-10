"use client"

import React, { createContext, useCallback, useEffect, useMemo, useState } from "react"

import { apiFetch } from "@/lib/api"

type AuthUser = {
  email: string
}

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  isReady: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

type AuthResponse = {
  accessToken: string
}

const STORAGE_KEY = "pit-finance:auth"

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStoredAuth(): { token: string | null; email: string | null } {
  if (typeof window === "undefined") return { token: null, email: null }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return { token: null, email: null }
  try {
    const parsed = JSON.parse(raw) as { token?: string; email?: string }
    return {
      token: parsed.token ?? null,
      email: parsed.email ?? null,
    }
  } catch {
    return { token: null, email: null }
  }
}

function writeStoredAuth(token: string, email: string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ token, email })
  )
}

function clearStoredAuth() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const stored = readStoredAuth()
    if (stored.token && stored.email) {
      setToken(stored.token)
      setUser({ email: stored.email })
    }
    setIsReady(true)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    setToken(data.accessToken)
    setUser({ email })
    writeStoredAuth(data.accessToken, email)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    setToken(data.accessToken)
    setUser({ email })
    writeStoredAuth(data.accessToken, email)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    clearStoredAuth()
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      isReady,
      login,
      register,
      logout,
    }),
    [user, token, isReady, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error("useAuthContext deve ser usado dentro de AuthProvider")
  }
  return context
}
