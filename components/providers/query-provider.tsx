"use client"

import * as React from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { queryClient } from "@/lib/query-client"
import { useAuthSync } from "@/lib/store"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      {children}
    </QueryClientProvider>
  )
}

function AuthSync() {
  useAuthSync()
  return null
}
