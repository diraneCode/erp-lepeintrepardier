import Image from "next/image"

import { cn } from "@/lib/utils"

/** Logo complet (fond blanc conservé pour respecter la charte). */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md bg-white", className)}>
      <Image src="/logo.jpg" alt="Le Peintre Pardier" width={720} height={290} loading="eager" className="h-full w-auto object-contain" />
    </div>
  )
}

/** Emblème seul (éventail de couleurs), recadré depuis le logo. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <div className={cn("relative size-8 shrink-0 overflow-hidden rounded-md bg-white", className)}>
      <Image src="/logo.jpg" alt="" width={720} height={290} loading="eager" className="absolute w-auto max-w-none" style={{ height: "135%", left: "-9%", top: "-30%" }} />
    </div>
  )
}
