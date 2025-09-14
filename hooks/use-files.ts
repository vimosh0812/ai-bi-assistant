"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { File } from "@/types/database"
import { useToast } from "@/hooks/use-toast"
import { se } from "date-fns/locale"

function parseCSV(csvText: string) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim())
  const result: string[][] = []

  for (const line of lines) {
    const row: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          i++ // Skip next quote
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === "," && !inQuotes) {
        row.push(current.trim())
        current = ""
      } else {
        current += char
      }
    }

    row.push(current.trim())
    result.push(row)
  }

  return result
}

export function useFiles(folderId?: string) {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { toast } = useToast()

  const fetchFiles = async () => {
    if (!folderId) {
      setFiles([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      console.log("Fetching files for folder:", folderId)
      const { data, error } = await supabase
        .from("files")
        .select("*")
        .eq("folder_id", folderId)
        .order("created_at", { ascending: false })
      console.log("Files fetch response:", { data, error })
      setLoading(false)

      if (error) throw error
      setFiles(data || [])
    } catch (error) {
      console.error("Error fetching files:", error)
      toast({
        title: "Error",
        description: "Failed to fetch files",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const uploadFile = async (data: { name: string; description: string; file: File }) => {
    if (!folderId) return

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      // Generate unique table name for CSV data
      const tableName = `csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      const csvText = await data.file.text()
      const parsedRows = parseCSV(typeof csvText === "string" ? csvText : String(csvText))

      if (parsedRows.length === 0) {
        throw new Error("CSV file is empty")
      }

      const headers = parsedRows[0].map((h) => h.replace(/"/g, "").trim())
      const dataRows = parsedRows.slice(1)

      console.log("[v0] Parsed CSV:", {
        headerCount: headers.length,
        dataRowCount: dataRows.length,
        headers: headers,
        firstRow: dataRows[0],
      })

      // Create the file record first
      const { data: newFile, error: fileError } = await supabase
        .from("files")
        .insert([
          {
            name: data.name,
            description: data.description,
            folder_id: folderId,
            user_id: user.user.id,
            table_name: tableName,
          },
        ])
        .select()
        .single()

      if (fileError) throw fileError

      const csvData = dataRows.map((row) => {
        const obj: any = {}
        headers.forEach((header, index) => {
          obj[header] = row[index] || ""
        })
        return obj
      })

      console.log("[v0] Sending to API:", {
        tableName,
        headers,
        dataCount: csvData.length,
        sampleData: csvData.slice(0, 2),
      })

      // Call the CSV storage API route
      const response = await fetch("/api/store-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableName,
          headers,
          data: csvData,
          fileId: newFile.id,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to store CSV data")
      }

      const result = await response.json()
      console.log("[v0] API Response:", result)

      setFiles((prev) => [newFile, ...prev])
      toast({
        title: "Success",
        description: `File uploaded successfully with ${result.rowCount} rows`,
      })
    } catch (error) {
      console.error("Error uploading file:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      })
    }
  }

  const deleteFile = async (id: string) => {
    try {
      const { error } = await supabase.from("files").delete().eq("id", id)

      if (error) throw error

      setFiles((prev) => prev.filter((file) => file.id !== id))
      toast({
        title: "Success",
        description: "File deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting file:", error)
      toast({
        title: "Error",
        description: "Failed to delete file",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    fetchFiles()
  }, [folderId])

  return {
    files,
    loading,
    uploadFile,
    deleteFile,
    refetch: fetchFiles,
  }
}
