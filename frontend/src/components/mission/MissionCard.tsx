"use client"

import React, { useState } from "react"
import type { IncidentRun, SupervisorIntervention } from "../../types/incident"
import { 
  Play, 
  Pause, 
  Zap, 
  SkipForward, 
  Users, 
  Clock, 
  Trophy,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  XCircle
} from "lucide-react"
import { cn } from "../../lib/utils"

type Phase = "briefing" | "detection" | "investigation" | "containment" | "recovery" | "review"
type Status = "in_progress" | "paused" | "completed" | "failed" | "abandoned"

interface MissionCardProps {
  run?: IncidentRun
  id?: string
  title?: string
  status?: Status
  phase?: Phase
  score?: number
  participantCount?: number
  phaseStartedAt?: string | null
  threatLevel?: "nominal" | "elevated" | "critical"
  onSelect?: (runId: string) => void
  onIntervene?: (runId: string, intervention: SupervisorIntervention) => void
}

const phases: Phase[] = ["briefing", "detection", "investigation", "containment", "recovery", "review"]

const minsInPhase = (startedAt: string | null) => {
  if (!startedAt) return 0
  const d = new Date(startedAt)
  const ms = Date.now() - d.getTime()
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.floor(ms / 60_000))
}

const statusConfig: Record<Status, { color: string; bgColor: string; icon: React.ElementType }> = {
  in_progress: { color: "text-emerald-600", bgColor: "bg-emerald-50 border-emerald-200", icon: Play },
  paused: { color: "text-amber-600", bgColor: "bg-amber-50 border-amber-200", icon: Pause },
  completed: { color: "text-blue-600", bgColor: "bg-blue-50 border-blue-200", icon: CheckCircle },
  failed: { color: "text-red-600", bgColor: "bg-red-50 border-red-200", icon: XCircle },
  abandoned: { color: "text-neutral-600", bgColor: "bg-neutral-50 border-neutral-200", icon: AlertCircle },
}

const threatConfig = {
  nominal: { label: "Nominal", color: "text-emerald-600", bgColor: "bg-emerald-50 border-emerald-200" },
  elevated: { label: "Elevated", color: "text-amber-600", bgColor: "bg-amber-50 border-amber-200" },
  critical: { label: "Critical", color: "text-red-600", bgColor: "bg-red-50 border-red-200 animate-pulse" },
}

export function MissionCard({
  run,
  id: idProp,
  title: titleProp,
  status: statusProp,
  phase: phaseProp,
  score: scoreProp,
  participantCount: participantCountProp,
  phaseStartedAt: phaseStartedAtProp,
  threatLevel: threatLevelProp,
  onSelect,
  onIntervene,
}: MissionCardProps) {
  const id = idProp ?? run?.id ?? "mission-1"
  const title = titleProp ?? run?.scenario.title ?? "Operation Watchdog"
  const status = (statusProp ?? run?.status ?? "in_progress") as Status
  const phase = (phaseProp ?? run?.phase ?? "detection") as Phase
  const score = scoreProp ?? run?.score ?? 0
  const participantCount = participantCountProp ?? run?.participant_count ?? 1
  const phaseStartedAt = phaseStartedAtProp ?? run?.phase_started_at ?? null
  const threatLevel = threatLevelProp ?? "nominal"
  const [showInject, setShowInject] = useState(false)
  const [injectLabel, setInjectLabel] = useState("Threat Inject")
  const [injectSeverity, setInjectSeverity] = useState(3)

  const currentPhaseIdx = phases.indexOf(phase)
  const statusInfo = statusConfig[status]
  const threatInfo = threatConfig[threatLevel]
  const StatusIcon = statusInfo.icon

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-4 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-neutral-900 truncate">{title}</h3>
            <p className="mt-0.5 text-xs text-neutral-400 font-mono">{id}</p>
          </div>
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
            statusInfo.bgColor,
            statusInfo.color
          )}>
            <StatusIcon className="h-3 w-3" />
            {status.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Phase Progress */}
      <div className="px-4 py-3 bg-neutral-50">
        <div className="flex items-center gap-1">
          {phases.map((p, idx) => (
            <div
              key={p}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors",
                idx < currentPhaseIdx && "bg-emerald-500",
                idx === currentPhaseIdx && "bg-amber-500",
                idx > currentPhaseIdx && "bg-neutral-200"
              )}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-medium text-neutral-700 capitalize">{phase}</span>
          <span className="text-neutral-400">{currentPhaseIdx + 1}/{phases.length}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-px bg-neutral-100">
        <div className="bg-white p-3 text-center">
          <Trophy className="h-4 w-4 mx-auto text-amber-500" />
          <p className="mt-1 text-lg font-semibold text-neutral-900">{score}</p>
          <p className="text-[10px] text-neutral-400 uppercase">Score</p>
        </div>
        <div className="bg-white p-3 text-center">
          <Users className="h-4 w-4 mx-auto text-blue-500" />
          <p className="mt-1 text-lg font-semibold text-neutral-900">{participantCount}</p>
          <p className="text-[10px] text-neutral-400 uppercase">Players</p>
        </div>
        <div className="bg-white p-3 text-center">
          <Clock className="h-4 w-4 mx-auto text-violet-500" />
          <p className="mt-1 text-lg font-semibold text-neutral-900">{minsInPhase(phaseStartedAt)}m</p>
          <p className="text-[10px] text-neutral-400 uppercase">In Phase</p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
            threatInfo.bgColor,
            threatInfo.color
          )}>
            {threatInfo.label}
          </span>
          
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onIntervene?.(id, { type: "PAUSE" })}
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 transition-colors"
              title="Pause"
            >
              <Pause className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowInject((v) => !v)}
              className={cn(
                "rounded-lg p-2 transition-colors",
                showInject ? "bg-amber-100 text-amber-600" : "text-neutral-500 hover:bg-neutral-100"
              )}
              title="Inject threat"
            >
              <Zap className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onIntervene?.(id, { type: "FORCE_PHASE" })}
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 transition-colors"
              title="Force phase"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Inject Panel */}
        {showInject && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 animate-in slide-in-from-top-2">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Inject Threat
            </p>
            <div className="space-y-2">
              <input
                value={injectLabel}
                onChange={(e) => setInjectLabel(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                placeholder="Label"
              />
              <select
                value={injectSeverity}
                onChange={(e) => setInjectSeverity(Number(e.target.value))}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    Severity {v}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInject(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-neutral-600 hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onIntervene?.(id, { type: "INJECT_THREAT", data: { label: injectLabel, severity: injectSeverity } })
                    setShowInject(false)
                  }}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
                >
                  Inject
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Button */}
        <button
          type="button"
          onClick={() => onSelect?.(id)}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
        >
          View Live
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
