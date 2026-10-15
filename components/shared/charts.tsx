"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts"
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  format,
  max as maxDate,
  min as minDate,
  startOfMonth,
} from "date-fns"
import { fr } from "date-fns/locale"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import type { DateRange } from "@/lib/date-range"
import { formatMoney, formatNumber, toDate } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Ordre catégoriel fixe — une série garde toujours sa couleur. */
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
export const OTHER_COLOR = "var(--chart-6)"

export interface Series {
  key: string
  label: string
  color: string
}

type Formatter = (v: number) => string
const money: Formatter = (v) => formatMoney(v, { compact: true })

/* ---------- Agrégation temporelle ---------- */

/**
 * Regroupe des lignes par jour (≤ 62 jours) ou par mois, en remplissant les
 * périodes vides pour que l'axe temporel reste continu.
 */
export function bucketByPeriod<T>(
  rows: T[],
  dateOf: (row: T) => string,
  values: Record<string, (row: T) => number>,
  range?: DateRange
) {
  const dates = rows.map((r) => toDate(dateOf(r))).filter((d): d is Date => !!d)
  const from = range?.from ?? (dates.length ? minDate(dates) : new Date())
  const to = range?.to ?? (dates.length ? maxDate(dates) : new Date())
  const daily = differenceInCalendarDays(to, from) <= 62
  const keyOf = (d: Date) => format(d, daily ? "yyyy-MM-dd" : "yyyy-MM")
  const periods = daily ? eachDayOfInterval({ start: from, end: to }) : eachMonthOfInterval({ start: startOfMonth(from), end: endOfMonth(to) })
  const buckets = new Map<string, Record<string, number | string>>()
  for (const p of periods) {
    const entry: Record<string, number | string> = { period: keyOf(p), label: format(p, daily ? "d MMM" : "MMM yy", { locale: fr }) }
    for (const k of Object.keys(values)) entry[k] = 0
    buckets.set(keyOf(p), entry)
  }
  for (const r of rows) {
    const d = toDate(dateOf(r))
    if (!d) continue
    const b = buckets.get(keyOf(d))
    if (!b) continue
    for (const [k, fn] of Object.entries(values)) b[k] = (b[k] as number) + fn(r)
  }
  return { data: [...buckets.values()], granularity: daily ? ("jour" as const) : ("mois" as const) }
}

/** Garde les n premières catégories et regroupe le reste dans « Autres ». */
export function topWithOther(items: { name: string; value: number }[], n = 4) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const head = sorted.slice(0, n).map((x, i) => ({ ...x, color: SERIES_COLORS[i] }))
  const rest = sorted.slice(n).reduce((s, x) => s + x.value, 0)
  return rest > 0 ? [...head, { name: "Autres", value: rest, color: OTHER_COLOR }] : head
}

/* ---------- Infobulle & légende ---------- */

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; dataKey?: string; payload?: Record<string, unknown> }[]
  label?: string
  formatter: Formatter
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label && <div className="mb-1.5 font-medium">{label}</div>}
      <div className="flex flex-col gap-1">
        {payload.map((p) => (
          <div key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color ?? (p.payload?.color as string) }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto pl-3 font-medium tabular">{formatter(Number(p.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartLegend({ items, className }: { items: { label: string; color: string; value?: string }[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs", className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
          {i.value && <span className="font-medium text-foreground tabular">{i.value}</span>}
        </span>
      ))}
    </div>
  )
}

function configOf(series: Series[]): ChartConfig {
  return Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
}

/** Vrai si au moins une série a une valeur non nulle sur la période. */
function hasValues(data: Record<string, number | string>[], series: Series[]) {
  return data.some((d) => series.some((s) => Number(d[s.key]) !== 0 && Number.isFinite(Number(d[s.key]))))
}

/* ---------- Barres verticales (évolution) ---------- */

export function TimeBarChart({
  data,
  series,
  formatter = money,
  stacked,
  className,
}: {
  data: Record<string, number | string>[]
  series: Series[]
  formatter?: Formatter
  stacked?: boolean
  className?: string
}) {
  if (!hasValues(data, series)) return <EmptyChart />
  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && <ChartLegend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
      <ChartContainer config={configOf(series)} className={cn("aspect-auto h-64 w-full", className)}>
        <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis dataKey="label" {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} width={56} tickFormatter={(v) => formatMoney(v, { compact: true, currency: false })} />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip formatter={formatter} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? "a" : undefined}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
              stroke={stacked ? "var(--card)" : undefined}
              strokeWidth={stacked ? 2 : 0}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  )
}

/* ---------- Lignes (tendance) ---------- */

export function TimeLineChart({
  data,
  series,
  formatter = money,
  className,
}: {
  data: Record<string, number | string>[]
  series: Series[]
  formatter?: Formatter
  className?: string
}) {
  if (!hasValues(data, series)) return <EmptyChart />
  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && <ChartLegend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
      <ChartContainer config={configOf(series)} className={cn("aspect-auto h-64 w-full", className)}>
        <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} width={56} tickFormatter={(v) => formatMoney(v, { compact: true, currency: false })} />
          <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }} content={<ChartTooltip formatter={formatter} />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--card)" }}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  )
}

/* ---------- Anneau (répartition) ---------- */

export function DonutChart({
  data,
  formatter = money,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number; color: string }[]
  formatter?: Formatter
  centerLabel?: string
  centerValue?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <EmptyChart />
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative size-44 shrink-0">
        <ChartContainer config={{}} className="aspect-square size-44">
          <PieChart>
            <Tooltip content={<ChartTooltip formatter={formatter} />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={0} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        {centerValue && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-semibold tabular">{centerValue}</span>
            {centerLabel && <span className="text-[11px] text-muted-foreground">{centerLabel}</span>}
          </div>
        )}
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
            <span className="shrink-0 font-medium tabular">{formatter(d.value)}</span>
            <span className="w-11 text-right text-xs text-muted-foreground tabular">{formatNumber((d.value / total) * 100, 0)} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- Classement (barres horizontales HTML) ---------- */

export function RankingBars({
  items,
  formatter = money,
  color = "var(--chart-1)",
}: {
  items: { label: string; value: number; sub?: string }[]
  formatter?: Formatter
  color?: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <EmptyChart />
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => (
        <li key={i.label} className="group flex flex-col gap-1.5" title={`${i.label} : ${formatter(i.value)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {i.label}
              {i.sub && <span className="ml-1.5 text-xs text-muted-foreground">{i.sub}</span>}
            </span>
            <span className="shrink-0 font-medium tabular">{formatter(i.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-[width] duration-500 group-hover:opacity-80" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function EmptyChart({ label = "Aucune donnée sur la période" }: { label?: string }) {
  return <div className="flex h-44 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">{label}</div>
}
