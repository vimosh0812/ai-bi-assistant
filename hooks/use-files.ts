"use client"

import { useState, useEffect, useCallback } from "react"
import type { File } from "@/types/database"
import { useToast } from "@/hooks/use-toast"
import { fetchFilesAction, deleteFileAction } from "@/actions/files-actions"

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
  const { toast } = useToast()

  const fetchFiles = useCallback(async () => {
    if (!folderId) {
      console.warn("No folderId passed → skipping fetch")
      setFiles([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await fetchFilesAction(folderId)
      setFiles(data || [])
    } catch (error) {
      console.error("Error fetching files:", error)
      setFiles([])
      toast({
        title: "Error",
        description: "Failed to fetch files",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [folderId, toast])

  const uploadFile = async (payload: { name: string; description: string; file: File; aiSummary?: any }) => {
      if (!folderId) return toast({ title: "Error", description: "No folder selected", variant: "destructive" });

      setLoading(true);
      try {
        const csvText = await payload.file.text();
        console.log("Read CSV text, length:");
        const res = await fetch("/api/upload-csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: payload.name,
            description: payload.description,
            csvText,
            folderId,
            aiSummary: payload.aiSummary || null,
          }),
        });
        console.log("Upload response:", res);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        setFiles((prev) => [data.file, ...prev]);
        toast({ title: "Success", description: `Uploaded ${data.rowCount} rows` });
      } catch (err) {
        console.error(err);
        toast({ title: "Error", description: err instanceof Error ? err.message : "Upload failed", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

  const deleteFile = async (id: string) => {
    try {
      await deleteFileAction(id)
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
