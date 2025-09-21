"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText } from "lucide-react"

export function FileUploadDialog() {
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState("")
  const [description, setDescription] = useState("")
  const [headers, setHeaders] = useState<string[]>([])
  const [data, setData] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Parse CSV
  const parseCSV = async (file: File) => {
    const text = await file.text()
    const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean)
    const cols = headerLine.split(",")
    const rows = lines.map((line) =>
      cols.reduce((acc, col, i) => ({ ...acc, [col]: line.split(",")[i] ?? null }), {})
    )
    setHeaders(cols)
    setData(rows)
    setFileName(file.name.replace(".csv", ""))
    setDescription(`Columns detected: ${cols.join(", ")}`)
  }

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return
    setFile(selectedFile)
    parseCSV(selectedFile)
  }

const handleSubmit = async () => {
  if (!file || !fileName) return;

  const webhookUrl = "https://hook.eu2.make.com/e36b5kyoy5gu6i912wymco9jd62qt7bc";

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fileName, description, headers, data }),
});
  if (!response.ok) {
    alert("Failed to send CSV for processing.");
    return;
  }
  alert("CSV sent to processing pipeline!");
  setFile(null);
  setFileName("");
  setDescription("");
  setHeaders([]);
  setData([]);
};

  return (
    <div className="p-4">
      <Label>Upload CSV</Label>
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
        />
        {file ? (
          <div className="flex items-center justify-center space-x-2">
            <FileText className="h-8 w-8 text-green-600" />
            <div>
              <p>{file.name}</p>
              <p>{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        ) : (
          <div>
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p>Drop CSV here or click to browse</p>
          </div>
        )}
      </div>

      {file && (
        <div className="mt-4">
          <Label>Preprocessing / Metadata</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
          <Button className="mt-2" onClick={handleSubmit}>
            Process & Continue
          </Button>
        </div>
      )}
    </div>
  )
}
