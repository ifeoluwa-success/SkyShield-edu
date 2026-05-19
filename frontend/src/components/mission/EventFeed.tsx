"use client"

import React, { useMemo } from "react"
import { cn } from "../../lib/utils"
import {
  Activity,
  Send,
  ArrowRight,
  AlertTriangle,
  Lightbulb,
  Zap,
  Clock,
  UserPlus,
  UserMinus,
} from "lucide-react"
import type { EventType, IncidentEvent } from "../../types/incident"

interface EventFeedProps {
  events?: IncidentEvent[]
  maxVisible?: number
  /** `immersive` = dark mission sidebar; `default` = legacy light cards */
  variant?: "default" | "immersive"
}

const pad2 = (n: number) => n.toString().padStart(2, "0")

const formatHHMMSS = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "--:--:--"
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

type EventStyle = { icon: React.ElementType; color: string; bg: string; border: string }

const lightEventConfig: Record<EventType, EventStyle> = {
  action_submitted: { icon: Send, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  phase_changed: { icon: ArrowRight, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  escalation_triggered: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  hint_requested: { icon: Lightbulb, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  intervention_applied: { icon: Zap, color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
  timeout_occurred: { icon: Clock, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  participant_joined: { icon: UserPlus, color: "text-neutral-600", bg: "bg-neutral-50", border: "border-neutral-200" },
  participant_left: { icon: UserMinus, color: "text-neutral-600", bg: "bg-neutral-50", border: "border-neutral-200" },
  system: { icon: Activity, color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
}

const immersiveEventConfig: Record<EventType, EventStyle> = {
  action_submitted: { icon: Send, color: "text-[var(--info)]", bg: "bg-[var(--info-dim)]", border: "border-[color-mix(in_srgb,var(--info)_30%,transparent)]" },
  phase_changed: { icon: ArrowRight, color: "text-[var(--success)]", bg: "bg-[var(--success-dim)]", border: "border-[color-mix(in_srgb,var(--success)_30%,transparent)]" },
  escalation_triggered: { icon: AlertTriangle, color: "text-[var(--danger)]", bg: "bg-[var(--danger-dim)]", border: "border-[color-mix(in_srgb,var(--danger)_30%,transparent)]" },
  hint_requested: { icon: Lightbulb, color: "text-[var(--warning)]", bg: "bg-[var(--warning-dim)]", border: "border-[color-mix(in_srgb,var(--warning)_30%,transparent)]" },
  intervention_applied: { icon: Zap, color: "text-[var(--cyan)]", bg: "bg-[var(--cyan-dim)]", border: "border-[color-mix(in_srgb,var(--cyan)_30%,transparent)]" },
  timeout_occurred: { icon: Clock, color: "text-[var(--warning)]", bg: "bg-[var(--warning-dim)]", border: "border-[color-mix(in_srgb,var(--warning)_25%,transparent)]" },
  participant_joined: { icon: UserPlus, color: "text-[var(--text-secondary)]", bg: "bg-[var(--bg-tertiary)]", border: "border-[var(--border-color)]" },
  participant_left: { icon: UserMinus, color: "text-[var(--text-muted)]", bg: "bg-[var(--bg-tertiary)]", border: "border-[var(--border-color)]" },
  system: { icon: Activity, color: "text-[var(--text-secondary)]", bg: "bg-[var(--bg-tertiary)]", border: "border-[var(--border-color)]" },
}

const describeEvent = (e: IncidentEvent) => {
  const msg = e.payload?.message
  if (typeof msg === "string" && msg.trim()) return msg
  if (e.event_type === "phase_changed") {
    const to = e.payload?.to
    if (typeof to === "string") return `Phase → ${to}`
  }
  if (e.actor_username) return `${e.event_type.replace(/_/g, " ")} by ${e.actor_username}`
  return e.event_type.replace(/_/g, " ")
}

export function EventFeed({ events = [], maxVisible = 12, variant = "immersive" }: EventFeedProps) {
  const visible = useMemo(() => events.slice(0, maxVisible), [events, maxVisible])
  const immersive = variant === "immersive"
  const eventConfig = immersive ? immersiveEventConfig : lightEventConfig

  return (
    <div
      className={cn(
        "flex h-full min-h-[160px] w-full flex-col rounded-xl border",
        immersive
          ? "border-[var(--border-color)] bg-[var(--bg-secondary)]"
          : "max-w-md border-neutral-200 bg-white p-4",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b px-3 py-2.5",
          immersive ? "border-[var(--border-color)] text-[var(--text-muted)]" : "mb-4 text-neutral-500",
        )}
      >
        <Activity className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">Event feed</span>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto", immersive ? "p-2" : "")}>
        <div className="space-y-1.5">
          {visible.length === 0 ? (
            <div
              className={cn(
                "py-8 text-center text-sm",
                immersive ? "text-[var(--text-muted)]" : "text-neutral-400",
              )}
            >
              No events yet
            </div>
          ) : (
            visible.map((e) => {
              const config = eventConfig[e.event_type] || eventConfig.action_submitted
              const Icon = config.icon

              return (
                <div
                  key={e.id}
                  className={cn("rounded-lg border p-2.5 transition-colors", config.bg, config.border)}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={cn("rounded-md p-1", config.bg)}>
                      <Icon className={cn("h-3.5 w-3.5", config.color)} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-[10px] font-semibold uppercase tracking-wide", config.color)}>
                          {e.event_type.replace(/_/g, " ")}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[10px]",
                            immersive ? "text-[var(--text-muted)]" : "text-neutral-400",
                          )}
                        >
                          {formatHHMMSS(e.timestamp)}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 truncate text-xs",
                          immersive ? "text-[var(--text-secondary)]" : "text-neutral-700",
                        )}
                      >
                        {describeEvent(e)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
