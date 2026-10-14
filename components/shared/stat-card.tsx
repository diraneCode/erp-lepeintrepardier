"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { LuArrowDownRight, LuArrowUpRight } from "react-icons/lu"

import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"

const tones = {
  violet: "bg-primary/10 text-primary",
  blue: "bg-info/10 text-info",
  green: "bg-success/10 text-success",
  orange: "bg-warning/10 text-warning",
  red: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const

export type StatTone = keyof typeof tones

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "violet",
  delta,
  deltaLabel = "vs période préc.",
  hint,
  invertDelta = false,
  index = 0,
  onClick,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: StatTone
  /** Variation en % */
  delta?: number
  deltaLabel?: string
  hint?: React.ReactNode
  /** Une hausse est négative (ex : dépenses) */
  invertDelta?: boolean
  index?: number
  onClick?: () => void
}) {
  const positive = delta !== undefined && (invertDelta ? delta <= 0 : delta >= 0)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground",
        onClick && "cursor-pointer transition-colors hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
            <Icon className="size-4" />
          </div>
        )}
      </div>
      <div className="text-xl font-semibold tracking-tight tabular md:text-2xl">{value}</div>
      {(delta !== undefined || hint) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {delta !== undefined && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? "text-success" : "text-destructive")}>
              {delta >= 0 ? <LuArrowUpRight className="size-3.5" /> : <LuArrowDownRight className="size-3.5" />}
              {formatNumber(Math.abs(delta), 1)} %
            </span>
          )}
          {delta !== undefined && <span className="text-muted-foreground">{deltaLabel}</span>}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </motion.div>
  )
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", className)}>{children}</div>
}
