"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { LuCircleCheck, LuInfo, LuTriangleAlert, LuOctagonX, LuLoaderCircle } from "react-icons/lu"

import { useTheme } from "@/components/providers/theme-provider"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        success: <LuCircleCheck className="size-4 text-success" />,
        info: <LuInfo className="size-4 text-info" />,
        warning: <LuTriangleAlert className="size-4 text-warning" />,
        error: <LuOctagonX className="size-4 text-destructive" />,
        loading: <LuLoaderCircle className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
