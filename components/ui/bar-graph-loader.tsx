"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

interface BarGraphLoaderProps {
  className?: string
  barCount?: number
  height?: number
}

export function BarGraphLoader({ 
  className, 
  barCount = 8,
  height = 120 
}: BarGraphLoaderProps) {
  const [barHeights, setBarHeights] = useState<number[]>([])

  useEffect(() => {
    // Generate random heights for bars (between 20% and 100% of container height)
    const heights = Array.from({ length: barCount }, () => 
      Math.random() * 0.8 + 0.2
    )
    setBarHeights(heights)
  }, [barCount])

  return (
    <div className={cn("flex items-end justify-center gap-2", className)} style={{ height: `${height}px` }}>
      {barHeights.map((heightRatio, index) => (
        <div
          key={index}
          className="bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-sm w-8 shadow-sm"
          style={{
            height: `${heightRatio * 100}%`,
            animation: `barPulse 1.5s ease-in-out infinite`,
            animationDelay: `${index * 0.1}s`,
          }}
        />
      ))}
    </div>
  )
}

