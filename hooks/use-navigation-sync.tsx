"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

export function useNavigationSync() {
  const pathname = usePathname()

  useEffect(() => {
    console.log("[v0] Navigation changed to:", pathname)

    // Broadcast navigation change to other components if needed
    window.dispatchEvent(
      new CustomEvent("navigation-change", {
        detail: { pathname },
      }),
    )
  }, [pathname])

  useEffect(() => {
    const handleNavigationChange = (event: CustomEvent) => {
      console.log("[v0] Received navigation change event:", event.detail.pathname)
    }

    window.addEventListener("navigation-change", handleNavigationChange as EventListener)

    return () => {
      window.removeEventListener("navigation-change", handleNavigationChange as EventListener)
    }
  }, [])

  return { pathname }
}
