"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { name: string; description: string; file: File }) => Promise<void>
  folderId: string
}

function parseCSVHeaders(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const firstLine = text.split(/\r?\n/).find((line) => line.trim())
      if (!firstLine) return resolve([])
      // Split by comma but ignore commas inside quotes
      const headers = firstLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || []
      resolve(headers.map((h) => h.replace(/"/g, "").trim()))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function FileUploadDialog({ open, onOpenChange, onSubmit, folderId }: FileUploadDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && file) {
      onSubmit({
        name: name.trim(),
        description: description.trim(),
        file: file,
      })
      setName("")
      setDescription("")
      setFile(null)
      onOpenChange(false)
    }
  }

  const generateDescriptionFromFile = async (selectedFile: File) => {
    try {
      const headers = await parseCSVHeaders(selectedFile)
      if (headers.length) {
        const structuredDescription =
          "Description:\n\n" +
          "Columns: {\n" +
          headers.map((h) => `  ${h}:`).join("\n") + "\n}\n" +
          "\nTags: "
        setDescription(structuredDescription)
      } else {
        setDescription("")
      }
    } catch (error) {
      console.error("Failed to parse CSV headers:", error)
      setDescription("")
    }
  }

  const handleFileChange = (selectedFile: File | null) => {
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile)
      if (!name) {
        setName(selectedFile.name.replace(".csv", ""))
      }
      generateDescriptionFromFile(selectedFile)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const droppedFile = e.dataTransfer.files[0]
    handleFileChange(droppedFile)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload CSV File</DialogTitle>
          <DialogDescription>
            Upload a CSV file to this folder. The data will be stored as a table for future analysis.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="file-upload">CSV File</Label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                  file ? "border-green-500 bg-green-50" : "",
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {file ? (
                  <div className="flex items-center justify-center space-x-2">
                    <FileText className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Drop your CSV file here or click to browse</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">File Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter file name"
                required
              />
            </div>

            {file && (
              <div className="grid gap-2">
                <Label htmlFor="description">Meta Data</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter file description (optional)"
                  rows={6}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file || !name.trim()}>
              Upload File
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
