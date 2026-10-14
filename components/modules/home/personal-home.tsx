"use client"

import Link from "next/link"
import * as React from "react"
import { LuArrowRight, LuCalendarDays, LuReceipt, LuTimer, LuWallet } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Page, PageHeader } from "@/components/shared/page"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { withTotals } from "@/components/modules/hr/payslip-view"
import { useAccess } from "@/hooks/use-access"
import { ANNUAL_LEAVE_DAYS, workedMinutes } from "@/lib/calc"
import { capitalize, formatDate, formatDuration, formatMoney, formatMonth, toISODate } from "@/lib/format"
import { attendanceStatus, expenseStatus, leaveStatus, leaveType } from "@/lib/labels"
import { useStore } from "@/lib/store"
import { LuLayoutDashboard } from "react-icons/lu"

/** Résumé de l'espace personnel (pointage, congés, paie, notes de frais). */
export function MySpaceSummary() {
  const { user } = useAccess()
  const attendance = useStore((s) => s.attendance)
  const leaves = useStore((s) => s.leaves)
  const payslips = useStore((s) => s.payslips)
  const expenses = useStore((s) => s.expenses)
  const today = toISODate(new Date())
  const year = today.slice(0, 4)

  const data = React.useMemo(() => {
    const id = user?.id
    const monthAtt = attendance.filter((a) => a.employeeId === id && a.date.startsWith(today.slice(0, 7)))
    const myLeaves = leaves.filter((l) => l.employeeId === id)
    const used = myLeaves.filter((l) => l.type === "annuel" && l.startDate.startsWith(year) && (l.status === "approuve" || l.status === "en_attente")).reduce((s, l) => s + l.days, 0)
    const lastSlip = payslips.filter((p) => p.employeeId === id && p.status !== "brouillon").sort((a, b) => b.period.localeCompare(a.period))[0]
    return {
      todayRec: attendance.find((a) => a.employeeId === id && a.date === today),
      monthWorked: monthAtt.reduce((s, a) => s + workedMinutes(a), 0),
      remaining: Math.max(0, ANNUAL_LEAVE_DAYS - used),
      lastLeave: [...myLeaves].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0],
      lastSlip: lastSlip ? withTotals(lastSlip) : undefined,
      pendingExpenses: expenses.filter((e) => e.submittedBy === id && (e.status === "en_attente" || e.status === "approuvee")),
    }
  }, [user, attendance, leaves, payslips, expenses, today, year])

  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        <StatCard index={0} label="Pointage du jour" value={data.todayRec?.checkIn ?? "—"} icon={LuTimer} tone="blue" hint={data.todayRec ? `${attendanceStatus[data.todayRec.status].label}${data.todayRec.checkOut ? ` · départ ${data.todayRec.checkOut}` : ""}` : "pas encore pointé"} />
        <StatCard index={1} label="Heures ce mois" value={formatDuration(data.monthWorked)} icon={LuTimer} tone="violet" />
        <StatCard index={2} label={`Solde de congés ${year}`} value={`${data.remaining} j`} icon={LuCalendarDays} tone="green" hint={`sur ${ANNUAL_LEAVE_DAYS} j`} />
        <StatCard index={3} label="Dernier net à payer" value={data.lastSlip ? formatMoney(data.lastSlip.net, { compact: true }) : "—"} icon={LuReceipt} tone="orange" hint={data.lastSlip ? capitalize(formatMonth(data.lastSlip.period)) : undefined} />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mon pointage</CardTitle>
            <CardDescription>{data.todayRec ? `Arrivée ${data.todayRec.checkIn ?? "—"} · Départ ${data.todayRec.checkOut ?? "—"}` : "Pensez à pointer votre arrivée."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/moi/pointage"><LuTimer /> Pointer</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mes congés</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              {data.lastLeave ? (
                <>
                  {leaveType[data.lastLeave.type]} du {formatDate(data.lastLeave.startDate)}
                  <StatusBadge def={leaveStatus[data.lastLeave.status]} />
                </>
              ) : (
                "Aucune demande en cours."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/moi/conges?nouveau=1"><LuCalendarDays /> Demander un congé</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mes notes de frais</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              {data.pendingExpenses.length ? (
                <>
                  {data.pendingExpenses.length} en cours · {formatMoney(data.pendingExpenses.reduce((s, e) => s + e.amount, 0), { compact: true })}
                  <StatusBadge def={expenseStatus[data.pendingExpenses[0].status]} />
                </>
              ) : (
                "Aucune dépense en attente."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/depenses?nouveau=1"><LuWallet /> Nouvelle dépense</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/moi/paie">Mes bulletins de paie <LuArrowRight /></Link>
        </Button>
      </div>
    </div>
  )
}

/** Accueil des employés sans accès aux indicateurs de l'entreprise. */
export function PersonalHome() {
  const { user, roleLabel } = useAccess()
  const hour = new Date().getHours()
  if (!user) return null
  return (
    <Page>
      <PageHeader
        icon={LuLayoutDashboard}
        title={`${hour < 18 ? "Bonjour" : "Bonsoir"} ${user.firstName}`}
        description={`${user.position} · ${roleLabel} — ${capitalize(formatDate(new Date(), "EEEE d MMMM yyyy"))}`}
      />
      <MySpaceSummary />
    </Page>
  )
}
