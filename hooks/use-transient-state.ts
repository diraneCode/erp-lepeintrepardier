"use client"

import { useLayoutEffect, useState } from "react"

/**
 * État réinitialisé quand la page est masquée par <Activity> (cacheComponents).
 * À utiliser pour les dialogues, panneaux et menus transitoires afin qu'ils ne
 * restent pas ouverts lorsqu'on revient sur une page.
 */
export function useTransientState<T>(initial: T) {
  const [state, setState] = useState<T>(initial)
  useLayoutEffect(() => {
    return () => setState(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return [state, setState] as const
}
