import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

const palette = [
  "bg-primary/12 text-primary",
  "bg-info/12 text-info",
  "bg-success/12 text-success",
  "bg-warning/12 text-warning",
  "bg-destructive/12 text-destructive",
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className={cn("text-xs font-medium", palette[hash(name) % palette.length])}>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

export function PersonCell({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar name={name} className="size-7" />
      <div className="min-w-0">
        <div className="truncate font-medium">{name}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )
}
