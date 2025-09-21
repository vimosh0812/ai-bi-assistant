"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { File } from "@/types/database"
import { useToast } from "@/hooks/use-toast"

// --- Simple CSV parser ---
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
          i++ // Skip escaped quote
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

  // ✅ Fetch Files (memoized)
  const fetchFiles = useCallback(async () => {
    if (!folderId) {
      console.warn("No folderId passed → skipping fetch")
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

      if (error) {
        console.error("Supabase error:", error)
        setFiles([])
      } else {
        setFiles(data || [])
      }
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
  }, [folderId, supabase, toast])

  // ✅ Upload File
  const uploadFile = async (payload: { name: string; description: string; file: File }) => {
    if (!folderId) {
      console.error("uploadFile aborted → folderId is missing")
      toast({ title: "Error", description: "No folder selected", variant: "destructive" })
      return
    }

    try {
      console.log("[uploadFile] Triggered with payload:", payload.name, payload.description)

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        console.log("[auth] Unauthorized", authError);
      } else {
        console.log("[auth] Authorized user:", user.id);
      }

      if (authError || !user) throw new Error("Unauthorized");
      
      const tableName = `csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      console.log("[uploadFile] Generated table:", tableName)

      const csvText = await payload.file.text()
      const parsedRows = parseCSV(typeof csvText === "string" ? csvText : String(csvText))

      if (parsedRows.length === 0) throw new Error("CSV file is empty")

      const headers = parsedRows[0].map((h) => h.replace(/"/g, "").trim())
      const dataRows = parsedRows.slice(1).filter((row) => row.length === headers.length)

      console.log("[uploadFile] Parsed CSV:", {
        headerCount: headers.length,
        validRowCount: dataRows.length,
        droppedRows: parsedRows.length - 1 - dataRows.length,
      })

      // Insert file metadata first
      const { data: newFile, error: fileError } = await supabase
        .from("files")
        .insert([
          {
            name: payload.name,
            description: payload.description,
            folder_id: folderId,
            user_id: user.id,
            table_name: tableName,
          },
        ])
        .select()
        .single()

      if (fileError) throw fileError

      const csvData = dataRows.map((row) => {
        const obj: Record<string, string> = {}
        headers.forEach((header, index) => (obj[header] = row[index] || ""))
        return obj
      })

      console.log("[uploadFile] Sending to API:", {
        tableName,
        headers,
        dataCount: csvData.length,
        sampleRow: csvData[0],
      })

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
      console.log("[uploadFile] API Response:", result)

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
      toast({ title: "Success", description: "File deleted successfully" })
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
    console.log("useFiles → folderId changed:", folderId)
    fetchFiles()
  }, [folderId, fetchFiles])

  return { files, loading, uploadFile, deleteFile, refetch: fetchFiles }
}
