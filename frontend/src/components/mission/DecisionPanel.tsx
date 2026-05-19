"use client"

import { useEffect, useState } from "react"
import { cn } from "../../lib/utils"
import { Lightbulb, CheckCircle2, Radio } from "lucide-react"
import { Spinner } from "../ui/Loading"

interface Option {
  id: string
  text: string
}

interface DecisionPanelProps {
  description?: string
  options?: Option[]
  onSubmitAction?: (optionId: string) => void
  onRequestHint?: () => void
  isSubmitting?: boolean
  hintText?: string | null
  hintsUsed?: number
  maxHints?: number
  channelConnected?: boolean
  awaitingNextStep?: boolean
  /** `immersive` = dark mission console; `default` = legacy light card */
  variant?: "default" | "immersive"
}

export function DecisionPanel({
  description,
  options = [],
  onSubmitAction,
  onRequestHint,
  isSubmitting = false,
  hintText = null,
  hintsUsed = 0,
  maxHints = 3,
  channelConnected = false,
  awaitingNextStep = false,
  variant = "immersive",
}: DecisionPanelProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const immersive = variant === "immersive"

  useEffect(() => {
    setSelected(null)
  }, [options, description])

  const canHint = hintsUsed < maxHints && !isSubmitting
  const hasOptions = options.length > 0

  const handleSelect = (optionId: string) => {
    if (isSubmitting) return
    setSelected(optionId)
    onSubmitAction?.(optionId)
  }

  return (
    <div className={cn("w-full", immersive ? "max-w-none" : "max-w-3xl mx-auto")}>
      <div
        className={cn(
          "overflow-hidden rounded-xl border",
          immersive
            ? "border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-[var(--shadow-sm)]"
            : "rounded-2xl border-neutral-200 bg-white shadow-lg",
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5",
            immersive
              ? "border-[var(--border-color)] bg-[var(--bg-tertiary)]"
              : "border-neutral-100 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4",
          )}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "h-2 w-2 shrink-0 animate-pulse rounded-full",
                immersive ? "bg-[var(--cyan)]" : "bg-amber-500",
              )}
            />
            <span
              className={cn(
                "text-xs font-semibold uppercase tracking-widest",
                immersive ? "text-[var(--cyan)]" : "text-neutral-700",
              )}
            >
              Incident response
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs", immersive ? "text-[var(--text-muted)]" : "text-neutral-500")}>
              Hints:{" "}
              <span className={cn("font-semibold", immersive ? "text-[var(--cyan)]" : "text-amber-600")}>
                {hintsUsed}/{maxHints}
              </span>
            </span>
            <button
              type="button"
              disabled={!canHint}
              onClick={() => onRequestHint?.()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                canHint
                  ? immersive
                    ? "bg-[var(--cyan-dim)] text-[var(--cyan)] hover:brightness-110"
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  : immersive
                    ? "cursor-not-allowed bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                    : "cursor-not-allowed bg-neutral-100 text-neutral-400",
              )}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Get hint
            </button>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5 sm:py-5">
          {(awaitingNextStep || isSubmitting) && (
            <div
              className={cn(
                "mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                immersive
                  ? "border-[color-mix(in_srgb,var(--cyan)_35%,transparent)] bg-[var(--cyan-dim)] text-[var(--cyan)]"
                  : "border-amber-200/80 bg-amber-50/90 text-amber-900",
              )}
            >
              <Spinner size="sm" />
              <span>
                {awaitingNextStep ? "Locking in decision — syncing mission state…" : "Submitting…"}
              </span>
            </div>
          )}

          <div
            className={cn(
              "rounded-lg border p-4",
              immersive
                ? "border-[var(--border-color)] bg-[var(--bg-tertiary)]"
                : "rounded-xl border-neutral-100 bg-neutral-50",
            )}
          >
            {description ? (
              <p
                className={cn(
                  "whitespace-pre-wrap text-sm leading-relaxed",
                  immersive ? "text-[var(--text-primary)]" : "text-neutral-700",
                )}
              >
                {description}
              </p>
            ) : (
              <p className={cn("text-sm italic", immersive ? "text-[var(--text-muted)]" : "text-neutral-400")}>
                {channelConnected
                  ? "Awaiting step instructions from mission control…"
                  : "Live channel reconnecting — decisions are paused until mission state is restored."}
              </p>
            )}
          </div>

          {hasOptions ? (
            <div className="mt-4 space-y-2">
              {options.map((opt) => {
                const isSelected = selected === opt.id
                const disabled = isSubmitting && !isSelected

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelect(opt.id)}
                    className={cn(
                      "group w-full rounded-lg border px-4 py-3 text-left text-sm transition-all duration-200",
                      immersive
                        ? isSelected
                          ? "border-[var(--cyan)] bg-[var(--cyan-dim)] text-[var(--text-primary)] ring-1 ring-[color-mix(in_srgb,var(--cyan)_40%,transparent)]"
                          : "border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        : isSelected
                          ? "border-amber-500 bg-amber-50 text-neutral-900 ring-2 ring-amber-500/20"
                          : "border-neutral-200 bg-white text-neutral-700 hover:border-amber-300 hover:bg-amber-50/50",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>{opt.text}</span>
                      {isSelected && (
                        <CheckCircle2
                          className={cn("h-5 w-5 shrink-0", immersive ? "text-[var(--cyan)]" : "text-amber-500")}
                        />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div
              className={cn(
                "mt-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center",
                immersive
                  ? "border-[var(--border-color)] bg-[var(--bg-tertiary)]/50"
                  : "border-neutral-200 bg-neutral-50/80 py-10",
              )}
            >
              <Radio
                className={cn("h-7 w-7", immersive ? "text-[var(--text-muted)]" : "text-neutral-300")}
                aria-hidden
              />
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    immersive ? "text-[var(--text-secondary)]" : "text-neutral-600",
                  )}
                >
                  No response options yet
                </p>
                <p className={cn("mt-1 text-xs", immersive ? "text-[var(--text-muted)]" : "text-neutral-500")}>
                  {channelConnected
                    ? "Options appear when the server advances the mission step."
                    : "Reconnect to mission control to continue."}
                </p>
              </div>
              {(awaitingNextStep || isSubmitting) && (
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    immersive ? "text-[var(--cyan)]" : "text-amber-800",
                  )}
                >
                  <Spinner size="sm" />
                  Waiting for next step…
                </div>
              )}
            </div>
          )}

          {hintText ? (
            <div
              className={cn(
                "mt-4 rounded-lg border p-4",
                immersive
                  ? "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-dim)]"
                  : "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "rounded-full p-1.5",
                    immersive ? "bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]" : "bg-amber-100",
                  )}
                >
                  <Lightbulb
                    className={cn("h-4 w-4", immersive ? "text-[var(--warning)]" : "text-amber-600")}
                  />
                </div>
                <div>
                  <p
                    className={cn(
                      "mb-1 text-xs font-semibold uppercase tracking-wide",
                      immersive ? "text-[var(--warning)]" : "text-amber-700",
                    )}
                  >
                    Hint
                  </p>
                  <p className={cn("text-sm", immersive ? "text-[var(--text-primary)]" : "text-amber-900")}>
                    {hintText}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
