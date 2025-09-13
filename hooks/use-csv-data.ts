"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"

interface CSVData {
  data: any[]
  columns: string[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function useCSVData(tableName?: string) {
  const [csvData, setCSVData] = useState<CSVData | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const fetchData = async (page = 1, limit = 50) => {
    if (!tableName) return

    setLoading(true)
    try {
      const response = await fetch(`/api/get-csv-data?tableName=${tableName}&page=${page}&limit=${limit}`)

      if (!response.ok) throw new Error("Failed to fetch data")

      const data = await response.json()
      setCSVData(data)
    } catch (error) {
      console.error("Error fetching CSV data:", error)
      toast({
        title: "Error",
        description: "Failed to fetch CSV data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tableName) {
      fetchData()
    }
  }, [tableName])

  return {
    csvData,
    loading,
    fetchData,
  }
}
