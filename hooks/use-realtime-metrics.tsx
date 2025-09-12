"use client"

import { useEffect, useState } from "react"

interface Metrics {
  totalUsers: number
  activeUsers: number
  totalRevenue: number
  systemHealth: number
  dataSources: number
  lastUpdated: Date
}

export function useRealtimeMetrics() {
  const [metrics, setMetrics] = useState<Metrics>({
    totalUsers: 2350,
    activeUsers: 2100,
    totalRevenue: 45231.89,
    systemHealth: 99.9,
    dataSources: 12,
    lastUpdated: new Date(),
  })

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    console.log("[v0] Starting real-time metrics simulation")

    const interval = setInterval(() => {
      setMetrics((current) => {
        const newMetrics = {
          ...current,
          totalUsers: current.totalUsers + Math.floor(Math.random() * 3),
          activeUsers: current.activeUsers + Math.floor(Math.random() * 2),
          totalRevenue: current.totalRevenue + Math.random() * 100,
          systemHealth: Math.max(98, Math.min(100, current.systemHealth + (Math.random() - 0.5) * 0.2)),
          lastUpdated: new Date(),
        }

        console.log("[v0] Metrics updated:", {
          users: newMetrics.totalUsers,
          revenue: newMetrics.totalRevenue.toFixed(2),
          health: newMetrics.systemHealth.toFixed(1),
        })

        return newMetrics
      })
    }, 5000) // Update every 5 seconds

    return () => {
      console.log("[v0] Cleaning up metrics interval")
      clearInterval(interval)
    }
  }, [])

  const refreshMetrics = async () => {
    setLoading(true)
    console.log("[v0] Manually refreshing metrics")

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setMetrics((current) => ({
      ...current,
      lastUpdated: new Date(),
    }))

    setLoading(false)
  }

  return { metrics, loading, refreshMetrics }
}
