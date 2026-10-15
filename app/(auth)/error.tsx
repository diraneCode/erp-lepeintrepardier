"use client"

import { CrashScreen } from "@/components/shared/crash-screen"

export default function AuthError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <CrashScreen {...props} />
}
