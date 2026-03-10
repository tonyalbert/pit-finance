"use client"

import { useCallback, useEffect, useState } from "react"

export interface ThemeColorPreset {
  name: string
  hue: number
}

export const COLOR_PRESETS: ThemeColorPreset[] = [
  { name: "Verde", hue: 160 },
  { name: "Azul", hue: 250 },
  { name: "Índigo", hue: 270 },
  { name: "Roxo", hue: 290 },
  { name: "Rosa", hue: 330 },
  { name: "Vermelho", hue: 25 },
  { name: "Laranja", hue: 50 },
  { name: "Ciano", hue: 200 },
]

const STORAGE_KEY = "pit-finance-color-hue"
const DEFAULT_HUE = 160

function generateLightVars(hue: number) {
  return {
    "--background": `oklch(0.98 0.005 ${hue})`,
    "--foreground": `oklch(0.145 0.02 ${hue})`,
    "--card": "oklch(1 0 0)",
    "--card-foreground": `oklch(0.145 0.02 ${hue})`,
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": `oklch(0.145 0.02 ${hue})`,
    "--primary": `oklch(0.55 0.17 ${hue})`,
    "--primary-foreground": "oklch(0.99 0 0)",
    "--secondary": `oklch(0.96 0.01 ${hue})`,
    "--secondary-foreground": `oklch(0.2 0.04 ${hue})`,
    "--muted": `oklch(0.96 0.008 ${hue})`,
    "--muted-foreground": `oklch(0.5 0.02 ${hue})`,
    "--accent": `oklch(0.94 0.02 ${hue})`,
    "--accent-foreground": `oklch(0.2 0.04 ${hue})`,
    "--border": `oklch(0.9 0.015 ${hue})`,
    "--input": `oklch(0.9 0.015 ${hue})`,
    "--ring": `oklch(0.55 0.17 ${hue})`,
    "--chart-1": `oklch(0.55 0.17 ${hue})`,
    "--chart-2": `oklch(0.65 0.16 ${hue + 15})`,
    "--chart-3": `oklch(0.5 0.12 ${hue + 40})`,
    "--chart-4": `oklch(0.75 0.15 ${hue - 15})`,
    "--chart-5": `oklch(0.45 0.13 ${hue + 25})`,
    "--sidebar": `oklch(0.97 0.008 ${hue})`,
    "--sidebar-foreground": `oklch(0.145 0.02 ${hue})`,
    "--sidebar-primary": `oklch(0.55 0.17 ${hue})`,
    "--sidebar-primary-foreground": "oklch(0.99 0 0)",
    "--sidebar-accent": `oklch(0.94 0.02 ${hue})`,
    "--sidebar-accent-foreground": `oklch(0.2 0.04 ${hue})`,
    "--sidebar-border": `oklch(0.9 0.015 ${hue})`,
    "--sidebar-ring": `oklch(0.55 0.17 ${hue})`,
  }
}

function generateDarkVars(hue: number) {
  return {
    "--background": `oklch(0.13 0.015 ${hue})`,
    "--foreground": `oklch(0.96 0.01 ${hue})`,
    "--card": `oklch(0.18 0.02 ${hue})`,
    "--card-foreground": `oklch(0.96 0.01 ${hue})`,
    "--popover": `oklch(0.18 0.02 ${hue})`,
    "--popover-foreground": `oklch(0.96 0.01 ${hue})`,
    "--primary": `oklch(0.6 0.18 ${hue})`,
    "--primary-foreground": `oklch(0.12 0.02 ${hue})`,
    "--secondary": `oklch(0.22 0.025 ${hue})`,
    "--secondary-foreground": `oklch(0.96 0.01 ${hue})`,
    "--muted": `oklch(0.22 0.025 ${hue})`,
    "--muted-foreground": `oklch(0.65 0.04 ${hue})`,
    "--accent": `oklch(0.22 0.025 ${hue})`,
    "--accent-foreground": `oklch(0.96 0.01 ${hue})`,
    "--border": `oklch(1 0.01 ${hue} / 12%)`,
    "--input": `oklch(1 0.01 ${hue} / 15%)`,
    "--ring": `oklch(0.6 0.18 ${hue})`,
    "--chart-1": `oklch(0.6 0.18 ${hue})`,
    "--chart-2": `oklch(0.65 0.16 ${hue + 15})`,
    "--chart-3": `oklch(0.7 0.14 ${hue - 15})`,
    "--chart-4": `oklch(0.55 0.15 ${hue + 40})`,
    "--chart-5": `oklch(0.5 0.12 ${hue + 25})`,
    "--sidebar": `oklch(0.16 0.02 ${hue})`,
    "--sidebar-foreground": `oklch(0.96 0.01 ${hue})`,
    "--sidebar-primary": `oklch(0.6 0.18 ${hue})`,
    "--sidebar-primary-foreground": `oklch(0.96 0.01 ${hue})`,
    "--sidebar-accent": `oklch(0.22 0.025 ${hue})`,
    "--sidebar-accent-foreground": `oklch(0.96 0.01 ${hue})`,
    "--sidebar-border": `oklch(1 0.01 ${hue} / 12%)`,
    "--sidebar-ring": `oklch(0.6 0.18 ${hue})`,
  }
}

function applyVars(hue: number) {
  const lightVars = generateLightVars(hue)
  const darkVars = generateDarkVars(hue)

  let styleEl = document.getElementById("pit-theme-colors")
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.id = "pit-theme-colors"
    document.head.appendChild(styleEl)
  }
  const lightCSS = Object.entries(lightVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")
  const darkCSS = Object.entries(darkVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")
  styleEl.textContent = `:root {\n${lightCSS}\n}\n.dark {\n${darkCSS}\n}`
}

export function useThemeColor() {
  const [hue, setHueState] = useState(DEFAULT_HUE)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const initial = stored ? Number(stored) : DEFAULT_HUE
    setHueState(initial)
    if (stored) applyVars(initial)
    setMounted(true)
  }, [])

  const setHue = useCallback((newHue: number) => {
    setHueState(newHue)
    localStorage.setItem(STORAGE_KEY, String(newHue))
    applyVars(newHue)
  }, [])

  return { hue, setHue, mounted }
}
