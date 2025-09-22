"use client"

import React, { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText, ArrowLeft, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import { Pie, Bar } from "react-chartjs-2"
import Papa from "papaparse"

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js"

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

interface FileUploadScreenProps {
  onBack: () => void
  onSubmit: (data: { name: string; description: string; file: File }) => Promise<void>
  folderId: string
}

interface DataQualitySummary {
  totalRows: number
  totalColumns: number
  duplicateCount: number
  emptyRowCount: number
  missingValueSummary: Record<string, number>
  lowValueColumns: string[]
  rowsWithMissingValues: number
}

export function FileUploadScreen({ onBack, onSubmit, folderId }: FileUploadScreenProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<DataQualitySummary | null>(null)
  const [aiSummary, setAiSummary] = useState<string>("")
  const [modifiedHeaders, setModifiedHeaders] = useState<string[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [processedData, setProcessedData] = useState<Record<string, any>[]>([])
  const [aiEmailColumns, setAiEmailColumns] = useState<string[]>([])
  const [aiCurrencyColumns, setAiCurrencyColumns] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDataProcessed, setIsDataProcessed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([])
  const [uploading, setUploading] = useState(false)

  const parseCSV = async (file: File) => {
    const text = await file.text()
    return new Promise<{ headers: string[]; rows: Record<string, any>[] }>((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => (value ? value.trim() : ""), // Trim values
        complete: (results) => {
          resolve({
            headers: results.meta.fields ?? [],
            rows: results.data as Record<string, any>[],
          })
        },
      })
    })
  }

  /** ✅ FIXED Missing value detection — ignore "0", "0.0", numbers, and currency */
  const generateDataQualitySummary = (headers: string[], data: Record<string, any>[]) => {
    const totalRows = data.length
    const totalColumns = headers.length
    const seen = new Set()
    let duplicateCount = 0
    const missingValueSummary: Record<string, number> = {}
    headers.forEach((h) => (missingValueSummary[h] = 0))
    let rowsWithMissingValues = 0
    let emptyRowCount = 0

    data.forEach((row) => {
      const key = JSON.stringify(row)
      if (seen.has(key)) duplicateCount++
      seen.add(key)

      let rowHasMissing = false
      let nonEmptyCount = 0
      headers.forEach((h) => {
        const val = row[h]

        // ✅ Only count as missing if it's truly empty/null/undefined
        if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
          missingValueSummary[h]++
          rowHasMissing = true
        } else {
          nonEmptyCount++
        }
      })

      if (rowHasMissing) rowsWithMissingValues++
      if (nonEmptyCount === 0) emptyRowCount++
    })

    const lowValueColumns = headers.filter((h) => missingValueSummary[h] / totalRows > 0.3)

    return {
      totalRows,
      totalColumns,
      duplicateCount,
      emptyRowCount,
      missingValueSummary,
      lowValueColumns,
      rowsWithMissingValues,
    }
  }

  /** Preprocess CSV data */
  const preprocessData = (
    headers: string[],
    data: Record<string, any>[],
    aiOutput: { emailColumns?: string[]; currencyColumns?: string[] }
  ) => {
    let processedData = [...data]
    let processedHeaders = [...headers]

    // Drop email columns
    if (aiOutput.emailColumns?.length) {
      processedHeaders = processedHeaders.filter((h) => !aiOutput.emailColumns!.includes(h))
      processedData = processedData.map((row) => {
        const newRow: Record<string, any> = {}
        processedHeaders.forEach((h) => (newRow[h] = row[h]))
        return newRow
      })
    }

    // Clean currency columns
    if (aiOutput.currencyColumns?.length) {
      processedData = processedData.map((row) => {
        const newRow = { ...row }
        aiOutput.currencyColumns!.forEach((col) => {
          if (Object.prototype.hasOwnProperty.call(newRow, col) && newRow[col] !== undefined && newRow[col] !== null && newRow[col] !== "") {
            newRow[col] = newRow[col].toString().replace(/[^0-9.-]+/g, "")
          }
        })
        return newRow
      })
    }

    // Drop columns with >30% missing values
    const dqSummary = generateDataQualitySummary(processedHeaders, processedData)
    processedHeaders = processedHeaders.filter((h) => !dqSummary.lowValueColumns.includes(h))
    processedData = processedData.map((row) => {
      const newRow: Record<string, any> = {}
      processedHeaders.forEach((h) => (newRow[h] = row[h]))
      return newRow
    })

    // Remove duplicate rows
    const seen = new Set()
    processedData = processedData.filter((row) => {
      const key = JSON.stringify(row)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Trim strings, convert numeric, parse date/time
    processedData = processedData.map((row) => {
      const newRow: Record<string, any> = {}
      processedHeaders.forEach((h) => {
        let val = row[h]
        if (typeof val === "string") val = val.trim()
        if (!isNaN(Number(val)) && val !== "") val = Number(val)
        else if (!isNaN(Date.parse(val))) val = new Date(val).toISOString()
        newRow[h] = val
      })
      return newRow
    })

    return { processedHeaders, processedData }
  }

  /** Convert preprocessed data to CSV */
  const convertToCSV = (headers: string[], data: Record<string, any>[]) => {
    const csvRows = [
      headers.join(","), // header row
      ...data.map((row) =>
        headers
          .map((h) => {
            let val = row[h] ?? ""
            if (typeof val === "string" && val.includes(",")) val = `"${val}"`
            return val
          })
          .join(",")
      ),
    ]
    return csvRows.join("\n")
  }

  /** Handle CSV selection */
  const handleFileChange = async (selectedFile: File | null) => {
    if (!selectedFile || selectedFile.type !== "text/csv") return
    setFile(selectedFile)
    if (!name) setName(selectedFile.name.replace(".csv", ""))

    const { headers, rows } = await parseCSV(selectedFile)
    setModifiedHeaders(headers)
    setProcessedData(rows) // initial full data before AI preprocessing

    // Use only sample for AI summary
    setSampleRows(rows.slice(0, 5))

    // Call AI summary
    setLoadingAI(true)
    try {
      const res = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, rows: rows.slice(0, 5) }),
      })
      const data = await res.json()
      setAiSummary(data.summary || "No summary available")
      setAiEmailColumns(data.emailColumns || [])
      setAiCurrencyColumns((data.currencyColumns || []).map((c: any) => c.name))
    } catch (err) {
      console.error(err)
      setAiSummary("Failed to generate AI summary")
    } finally {
      setLoadingAI(false)
    }

    setSummary(generateDataQualitySummary(headers, rows))
  }

  /** Handle preprocessing */
  const handlePreprocess = async () => {
    if (!processedData.length) return
    
    setIsProcessing(true)
    
    // Simulate processing delay for user feedback
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const result = preprocessData(modifiedHeaders, processedData, {
      emailColumns: aiEmailColumns,
      currencyColumns: aiCurrencyColumns,
    })
    setModifiedHeaders(result.processedHeaders)
    setProcessedData(result.processedData)
    setSummary(generateDataQualitySummary(result.processedHeaders, result.processedData))
    
    setIsProcessing(false)
    setIsDataProcessed(true)
    setAiSummary((prev) => prev + "\n\n✅ Data preprocessed and ready to submit.")
  }

  /** Handle submit */
  const handleSubmit = async (e: React.FormEvent) => {
    console.log("Submitting file:")
    e.preventDefault()
    console.log({ name, file, length: processedData.length })
    if (!name || !file || !processedData.length) return
    console.log("thaandave illa")
    setUploading(true)

    const csvContent = convertToCSV(modifiedHeaders, processedData)
    const csvFile = new File([csvContent], `${name}.csv`, { type: "text/csv" })
    console.log("Converted CSV file:", csvFile)

    await onSubmit({
      name,
      description,
      file: csvFile,
    })
    console.log("File submitted.")

    // Reset
    setName("")
    setDescription("")
    setFile(null)
    setAiSummary("")
    setSummary(null)
    setProcessedData([])
    setIsDataProcessed(false)
    setIsProcessing(false)
    setUploading(false)
  }

  /** Drag & drop handlers */
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true)
    else if (e.type === "dragleave") setDragActive(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleFileChange(e.dataTransfer.files[0])
  }

  /** Chart data based on preprocessed data */
  const pieData = processedData.length
    ? {
        labels: ["Duplicates", "Unique"],
        datasets: [
          {
            data: [
              generateDataQualitySummary(modifiedHeaders, processedData).duplicateCount,
              processedData.length -
                generateDataQualitySummary(modifiedHeaders, processedData).duplicateCount,
            ],
            backgroundColor: ["#000", "#0d6efd"],
          },
        ],
      }
    : null

  const barData = processedData.length
    ? (() => {
        const dq = generateDataQualitySummary(modifiedHeaders, processedData)
        const missingCols = Object.entries(dq.missingValueSummary).filter(([_, count]) => count > 0)
        return {
          labels: missingCols.map(([col]) => col),
          datasets: [
            {
              label: "Missing Values",
              data: missingCols.map(([_, count]) => count),
              backgroundColor: "#0d6efd",
            },
          ],
        }
      })()
    : null

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b">
        <Button variant="ghost" onClick={onBack} className="mr-3">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold">Upload CSV</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Form */}
        <div className="w-[60%] p-6 overflow-auto border-r">
          <form onSubmit={handleSubmit} className="grid gap-6">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                file ? "border-green-500 bg-green-50" : ""
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

            <div className="flex justify-end gap-3">
              <Button type="submit" disabled={!file || !name.trim() || uploading}>
                Upload File
              </Button>
            </div>
          </form>
        </div>

        {/* Right Summary */}
        <div className="w-[40%] p-6 bg-muted/30 flex flex-col">
          <div className="overflow-auto flex-1 space-y-4">
            {processedData.length > 0 && (
              <div className="p-3 bg-white rounded shadow space-y-3">
                <h3 className="font-semibold mb-2">Data Quality Summary</h3>
                {(() => {
                  const dq = generateDataQualitySummary(modifiedHeaders, processedData)
                  return (
                    <>
                      <p>Total Rows: {dq.totalRows}</p>
                      <p>Total Columns: {dq.totalColumns}</p>
                      <p>Empty Rows: {dq.emptyRowCount}</p>
                      <p>Duplicate Rows: {dq.duplicateCount}</p>
                      <p>Rows with Missing Values: {dq.rowsWithMissingValues}</p>
                        {aiEmailColumns.length > 0 && (
                          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                          <p className="text-yellow-800 text-sm font-medium">
                            Email column(s) detected:
                          </p>
                          <ul className="list-disc ml-5 text-yellow-800 text-sm">
                            {aiEmailColumns.map((col) => (
                            <li key={col}>{col}</li>
                            ))}
                          </ul>
                          </div>
                        )}

                        {aiCurrencyColumns.length > 0 && (
                          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                          <p className="text-yellow-800 text-sm font-medium">
                            💰 Currency column(s) detected:
                          </p>
                          <ul className="list-disc ml-5 text-yellow-800 text-sm">
                            {aiCurrencyColumns.map((col) => (
                            <li key={col}>{col}</li>
                            ))}
                          </ul>
                          </div>
                        )}

                        {Object.values(dq.missingValueSummary).some((count) => count > 0) && (
                        <div>
                          <strong>Missing Values per Column:</strong>
                          <ul className="list-disc ml-5">
                            {Object.entries(dq.missingValueSummary)
                              .filter(([_, count]) => count > 0)
                              .map(([col, count]) => (
                                <li key={col}>
                                  {col}: {count}
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}

                      {dq.lowValueColumns.length > 0 && (
                        <div>Low-Value Columns: {dq.lowValueColumns.join(", ")}</div>
                      )}

                      {pieData && dq.duplicateCount > 0 && (
                        <div className="mt-4" style={{ width: "60%" }}>
                          <h4 className="font-medium mb-1">Duplicate Rows Pie</h4>
                          <Pie data={pieData} />
                        </div>
                      )}

                      {barData && dq.rowsWithMissingValues > 0 && (
                        <div className="mt-4">
                          <h4 className="font-medium mb-1">Missing Values Bar</h4>
                          <Bar data={barData} />
                        </div>
                        )}

                        {(
                        !isDataProcessed &&
                        (
                          aiEmailColumns.length ||
                          aiCurrencyColumns.length ||
                          dq.lowValueColumns.length ||
                          dq.duplicateCount > 0 ||
                          dq.emptyRowCount > 0
                        ) && loadingAI === false
                        ) && (
                        <Button 
                          variant="outline" 
                          onClick={handlePreprocess} 
                          className="mt-3 flex items-center gap-2"
                          disabled={isProcessing}
                        >
                          <Cpu className="h-4 w-4" /> 
                          {isProcessing ? "Processing..." : "Preprocess Data"}
                        </Button>
                      )}

                      {isDataProcessed && (
                        <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-md">
                          <p className="text-green-800 text-sm font-medium">✅ Data preprocessed and ready to submit!</p>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}

            {/* AI Summary */}
            {loadingAI ? (
              <p className="text-muted-foreground">Loading AI summary...</p>
            ) : (
              aiSummary && (
                <div className="p-3 bg-white rounded shadow">
                  <h3 className="font-semibold mb-1 flex items-center gap-2">
                    <Cpu className="h-4 w-4" /> AI Insight
                  </h3>
                  <p className="text-sm whitespace-pre-line">{aiSummary}</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
