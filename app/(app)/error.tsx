"use client"

import { CrashScreen } from "@/components/shared/crash-screen"

export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <CrashScreen {...props} />
}
