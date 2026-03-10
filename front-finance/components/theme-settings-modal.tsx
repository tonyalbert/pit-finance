"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { COLOR_PRESETS, useThemeColor } from "@/hooks/use-theme-color"
import { Settings, Sun, Moon, Monitor } from "lucide-react"

export function ThemeSettingsModal() {
  const { hue, setHue, mounted } = useThemeColor()
  const { theme, setTheme } = useTheme()

  if (!mounted) return null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Configurações de aparência">
          <Settings className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Aparência</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Modo claro/escuro */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Modo</label>
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="flex-1"
              >
                <Sun className="mr-2 size-4" />
                Claro
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="flex-1"
              >
                <Moon className="mr-2 size-4" />
                Escuro
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("system")}
                className="flex-1"
              >
                <Monitor className="mr-2 size-4" />
                Auto
              </Button>
            </div>
          </div>

          {/* Cor principal */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Cor principal</label>
            <div className="grid grid-cols-4 gap-3">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hue}
                  onClick={() => setHue(preset.hue)}
                  className="group flex flex-col items-center gap-1.5"
                >
                  <div
                    className={`size-10 rounded-full border-2 transition-all ${
                      hue === preset.hue
                        ? "scale-110 border-foreground ring-2 ring-foreground/20"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ background: `oklch(0.55 0.17 ${preset.hue})` }}
                  />
                  <span className="text-[11px] text-muted-foreground group-hover:text-foreground">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Slider customizado */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Cor personalizada</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={360}
                value={hue}
                onChange={(e) => setHue(Number(e.target.value))}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full"
                style={{
                  background: `linear-gradient(to right, 
                    oklch(0.55 0.17 0), oklch(0.55 0.17 36), oklch(0.55 0.17 72), 
                    oklch(0.55 0.17 108), oklch(0.55 0.17 144), oklch(0.55 0.17 180), 
                    oklch(0.55 0.17 216), oklch(0.55 0.17 252), oklch(0.55 0.17 288), 
                    oklch(0.55 0.17 324), oklch(0.55 0.17 360))`,
                }}
              />
              <div
                className="size-8 rounded-full border"
                style={{ background: `oklch(0.55 0.17 ${hue})` }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
