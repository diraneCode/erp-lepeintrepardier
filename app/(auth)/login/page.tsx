"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { LuEye, LuEyeOff, LuLogIn } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { TextField } from "@/components/forms/fields"
import { Logo } from "@/components/layout/logo"
import { UserAvatar } from "@/components/shared/user-avatar"
import { DEFAULT_PASSWORD, ROLE_LABEL, type Role } from "@/lib/access"
import { initStore, useStore } from "@/lib/store"

const schema = z.object({
  email: z.email("Adresse e-mail invalide"),
  password: z.string().min(6, "6 caractères minimum"),
})

const DEMO_ROLES: Role[] = ["super_admin", "directeur_commercial", "commercial", "responsable_boutique", "caissiere", "vendeur", "gestionnaire_stock", "magasinier", "comptable", "rh", "marketing", "employe"]

export default function LoginPage() {
  const router = useRouter()
  const hydrated = useStore((s) => s.hydrated)
  const employees = useStore((s) => s.employees)
  const login = useStore((s) => s.login)
  const [show, setShow] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } })

  React.useEffect(() => {
    void initStore()
  }, [])

  const demo = DEMO_ROLES.map((r) => employees.find((e) => e.role === r && e.status === "actif")).filter((e) => !!e)

  const onSubmit = form.handleSubmit(async (v) => {
    setPending(true)
    await new Promise((r) => setTimeout(r, 400))
    const error = login(v.email, v.password)
    setPending(false)
    if (error) {
      form.setError("password", { message: error })
      return
    }
    form.reset({ email: "", password: "" })
    toast.success("Connexion réussie")
    // Page demandée avant la redirection vers /login (chemin interne uniquement)
    const next = new URLSearchParams(window.location.search).get("next")
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/")
  })

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <Logo className="h-14 self-start" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
            <p className="mt-1 text-sm text-muted-foreground">Accédez à votre espace Isonem avec votre adresse professionnelle.</p>
          </div>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <TextField control={form.control} name="email" label="E-mail professionnel" type="email" autoComplete="email" required />
            <div className="relative">
              <TextField control={form.control} name="password" label="Mot de passe" type={show ? "text" : "password"} autoComplete="current-password" required className="[&_input]:pr-9" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-8 right-2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={show ? "Masquer" : "Afficher"}>
                {show ? <LuEyeOff className="size-4" /> : <LuEye className="size-4" />}
              </button>
            </div>
            <Button type="submit" size="lg" disabled={pending || !hydrated}>
              {pending ? <Spinner /> : <LuLogIn />} Se connecter
            </Button>
            <p className="text-xs text-muted-foreground">Mot de passe oublié ? Contactez le service des ressources humaines.</p>
          </form>

          {demo.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-6">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Comptes de démonstration</p>
              <p className="text-xs text-muted-foreground">
                Mot de passe : <code className="rounded bg-muted px-1 py-0.5 font-mono">{DEFAULT_PASSWORD}</code>
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {demo.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      form.setValue("email", e.email)
                      form.setValue("password", DEFAULT_PASSWORD)
                      form.clearErrors()
                    }}
                    className="flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    <UserAvatar name={`${e.firstName} ${e.lastName}`} className="size-6 text-[10px]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{ROLE_LABEL[e.role]}</span>
                      <span className="block truncate text-muted-foreground">{e.firstName} {e.lastName}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <span className="text-sm font-medium opacity-80">ISONEM · Le Peintre Pardier</span>
        <div className="flex flex-col gap-4">
          <p className="max-w-md text-3xl leading-tight font-semibold">Ventes, stock, facturation, RH et comptabilité réunis dans un seul outil.</p>
          <div className="flex gap-2">
            {["var(--brand-blue)", "var(--brand-green)", "var(--brand-orange)", "var(--brand-red)"].map((c) => (
              <span key={c} className="h-1.5 w-10 rounded-full" style={{ background: c }} />
            ))}
          </div>
        </div>
        <span className="text-xs opacity-70">© Isonem — Douala, Cameroun</span>
      </div>
    </div>
  )
}
