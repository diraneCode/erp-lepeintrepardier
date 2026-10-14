import { Badge } from "@/components/ui/badge"
import type { LabelDef, Tone } from "@/lib/labels"
import { cn } from "@/lib/utils"

const variant: Record<Tone, "success" | "warning" | "info" | "destructive" | "violet" | "neutral"> = {
  success: "success",
  warning: "warning",
  info: "info",
  destructive: "destructive",
  violet: "violet",
  neutral: "neutral",
}

const dot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
  violet: "bg-primary",
  neutral: "bg-muted-foreground/60",
}

export function StatusBadge({ def, className }: { def?: LabelDef; className?: string }) {
  if (!def) return null
  return (
    <Badge variant={variant[def.tone]} className={cn("gap-1.5", className)}>
      <span className={cn("size-1.5 rounded-full", dot[def.tone])} />
      {def.label}
    </Badge>
  )
}
