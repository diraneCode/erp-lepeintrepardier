"use client"

import * as React from "react"

/**
 * Ne monte un dialogue (et ne charge ses données : listes d'options, stock…)
 * qu'à sa première ouverture. Il reste ensuite monté pour conserver
 * l'animation de fermeture et l'état du formulaire.
 */
export function lazyDialog<P extends { open: boolean }>(Dialog: React.ComponentType<P>) {
  function LazyDialog(props: P) {
    const [opened, setOpened] = React.useState(props.open)
    if (props.open && !opened) setOpened(true)
    return opened ? <Dialog {...props} /> : null
  }
  LazyDialog.displayName = `Lazy(${Dialog.displayName ?? Dialog.name})`
  return LazyDialog
}
