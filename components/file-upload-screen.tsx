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
  const [aiEmailColumns, setAiEmailColumns] = useState<(string | { name: string; type: string })[]>([])
  const [aiCurrencyColumns, setAiCurrencyColumns] = useState<(string | { name: string; currency: string })[]>([])
  const [importantColumns, setImportantColumns] = useState<string[]>([])
  const [irrelevantColumns, setIrrelevantColumns] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDataProcessed, setIsDataProcessed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([])
  const [uploading, setUploading] = useState(false)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1) // Step 1: Upload, Step 2: Summary, Step 3: Preprocessed

  const parseCSV: (file: File) => Promise<{ headers: string[]; rows: Record<string, any>[] }> = async (file: File) => {
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

  const preprocessData = (
    headers: string[],
    data: Record<string, any>[],
    aiOutput: { emailColumns?: { name: string; type: string }[]; currencyColumns?: { name: string; currency: string }[] }
  ) => {
    let processedData = [...data]
    let processedHeaders = [...headers]

    // Remove email columns (handle objects with name/type)
    if (aiOutput.emailColumns?.length) {
      const emailColumnNames = aiOutput.emailColumns.map((col) =>
        typeof col === "string" ? col : col.name
      )
      processedHeaders = processedHeaders.filter((h) => !emailColumnNames.includes(h))
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
          const colName = typeof col === "string" ? col : col.name
          if (
            Object.prototype.hasOwnProperty.call(newRow, colName) &&
            newRow[colName] !== undefined &&
            newRow[colName] !== null &&
            newRow[colName] !== ""
          ) {
            newRow[colName] = newRow[colName].toString().replace(/[^0-9.-]+/g, "")
          }
        })
        return newRow
      })
    }

    // Remove low-value columns (>30% missing)
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

    // Standardize data types
    processedData = processedData.map((row) => {
      const newRow: Record<string, any> = {}
      processedHeaders.forEach((h) => {
        let val = row[h]
        if (typeof val === "string") val = val.trim()
        if (!isNaN(Number(val)) && val !== "") val = Number(val)
        else if (typeof val === "string" && !isNaN(Date.parse(val))) val = new Date(val).toISOString()
        newRow[h] = val
      })
      return newRow
    })

    return { processedHeaders, processedData }
  }

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

  const handleFileChange = async (selectedFile: File | null) => {
    if (!selectedFile || selectedFile.type !== "text/csv") return
    setFile(selectedFile)
    if (!name) setName(selectedFile.name.replace(".csv", ""))

    const { headers, rows } = await parseCSV(selectedFile)
    setModifiedHeaders(headers)
    setProcessedData(rows)
    setSampleRows(rows.slice(0, 5))

    setLoadingAI(true)
    try {
      const res = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, rows: rows.slice(0, 5) }),
      })
      const data = await res.json()
      console.log("AI Summary response:", data)
      setAiSummary(data.summary || "No summary available")
      setImportantColumns(data.importantColumns || [])
      setIrrelevantColumns(data.irrelevantColumns || [])
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

  const handlePreprocess = async () => {
    if (!processedData.length) return
    
    setIsProcessing(true)
    
    const result = preprocessData(modifiedHeaders, processedData, {
      emailColumns: aiEmailColumns.map((col) =>
      typeof col === "string"
        ? { name: col, type: col.toLowerCase().includes("mobile") ? "mobile" : "email" }
        : col
      ),
      currencyColumns: aiCurrencyColumns.map((col) =>
      typeof col === "string"
        ? { name: col, currency: "unknown" }
        : col 
      ),
    })
    setModifiedHeaders(result.processedHeaders)
    setProcessedData(result.processedData)
    setSummary(generateDataQualitySummary(result.processedHeaders, result.processedData))
    
    setIsProcessing(false)
    setIsDataProcessed(true)
    setAiSummary((prev) => prev)
    setCurrentStep(3)
  }

  const handleNextToSummary = () => {
    if (file && name.trim()) {
      setCurrentStep(2)
    }
  }

  /** Handle back to previous step */
  const handleBackToPreviousStep = () => {
    if (currentStep === 3) {
      setCurrentStep(2)
    } else if (currentStep === 2) {
      setCurrentStep(1)
    } else {
      onBack()
    }
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

    setName("")
    setDescription("")
    setFile(null)
    setAiSummary("")
    setSummary(null)
    setProcessedData([])
    setIsDataProcessed(false)
    setIsProcessing(false)
    setUploading(false)
    setCurrentStep(1)
  }

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
        <Button variant="ghost" onClick={handleBackToPreviousStep} className="mr-3">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold">
          {currentStep === 1 && "Upload CSV"}
          {currentStep === 2 && "Data Summary"}
          {currentStep === 3 && "Preprocessed Data"}
        </h1>
      </div>

      {/* Step 1: File Upload */}
      {currentStep === 1 && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Upload section - 30% height */}
          <div className="flex-[3] p-6">
            <form onSubmit={(e) => e.preventDefault()} className="grid gap-6 max-w-2xl mx-auto h-full">
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors h-full flex flex-col justify-center items-center",
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
                    rows={3}
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 mt-2">
                <Button 
                  type="button" 
                  onClick={handleNextToSummary}
                  disabled={!file || !name.trim() || loadingAI}
                >
                  {loadingAI ? "Processing..." : "Next"}
                </Button>
              </div>
            </form>
          </div>

          {/* Preview section - 70% height */}
          <div className="flex-[7] p-4 bg-white border-t flex flex-col">
            <h3 className="font-semibold mb-2">Preview (First 20 Rows)</h3>
            <div className="max-h-[400px] overflow-auto border rounded flex-1">
              {processedData.length > 0 ? (
                <table className="min-w-full table-auto text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      {modifiedHeaders.map((header) => (
                        <th key={header} className="px-2 py-1 border">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {processedData.slice(0, 20).map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                        {modifiedHeaders.map((header) => (
                          <td key={header} className="px-2 py-1 border">
                            {row[header] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <span>No data loaded. Please upload a CSV file to preview.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Dashboard Summary */}
      {currentStep === 2 && (
        <div className="flex flex-col flex-1 overflow-auto p-6 bg-gray-50">
          <h2 className="text-2xl font-bold mb-6">Data Quality Dashboard</h2>

          {/* Top Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
            {/* Total Rows */}
            <div className="bg-white shadow rounded-lg p-4 flex flex-col justify-between">
              <p className="text-gray-500 text-sm">Total Rows</p>
              <p className="text-xl font-semibold">{generateDataQualitySummary(modifiedHeaders, processedData).totalRows}</p>
            </div>

            {/* Total Columns */}
            <div className="bg-white shadow rounded-lg p-4 flex flex-col justify-between">
              <p className="text-gray-500 text-sm">Total Columns</p>
              <p className="text-xl font-semibold">{generateDataQualitySummary(modifiedHeaders, processedData).totalColumns}</p>
            </div>

            {/* Empty Rows */}
            <div className="bg-white shadow rounded-lg p-4 flex flex-col justify-between">
              <p className="text-gray-500 text-sm">Empty Rows</p>
              <p className="text-xl font-semibold">{generateDataQualitySummary(modifiedHeaders, processedData).emptyRowCount}</p>
            </div>

            {/* Duplicate Rows */}
            <div className="bg-white shadow rounded-lg p-4 flex flex-col justify-between">
              <p className="text-gray-500 text-sm">Duplicate Rows</p>
              <p className="text-xl font-semibold">{generateDataQualitySummary(modifiedHeaders, processedData).duplicateCount}</p>
            </div>

            {/* Rows with Missing Values */}
            <div className="bg-white shadow rounded-lg p-4 flex flex-col justify-between">
              <p className="text-gray-500 text-sm">Rows with Missing Values</p>
              <p className="text-xl font-semibold">{generateDataQualitySummary(modifiedHeaders, processedData).rowsWithMissingValues}</p>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Duplicate vs Unique Pie */}
            {pieData && (
              <div className="bg-white shadow rounded-lg p-4 flex flex-col h-full">
                <h3 className="text-lg font-semibold mb-2">Duplicate vs Unique Rows</h3>
                <div className="flex flex-col h-full">
              <div className="h-48 flex items-center justify-center">
                <Pie data={pieData} />
              </div>
              <div className="flex justify-between mt-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#000" }} />
                  <span className="text-sm">Duplicates</span>
                  <span className="ml-2 font-semibold">
                {pieData.datasets[0].data[0]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#0d6efd" }} />
                  <span className="text-sm">Unique</span>
                  <span className="ml-2 font-semibold">
                {pieData.datasets[0].data[1]}
                  </span>
                </div>
              </div>
                </div>
              </div>
            )}

            {/* Missing Values Bar */}
            {barData && (
              <div className="bg-white shadow rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2">Missing Values by Column</h3>
                <div className="h-64 overflow-auto">
                  <Bar data={barData} />
                </div>
              </div>
            )}
          </div>

          {/* AI Summary Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {aiEmailColumns.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6 flex flex-col h-full min-h-[220px]">
                <h3 className="text-lg font-semibold mb-4">Privacy Details Detected</h3>
                <ul className="list-disc ml-5 text-sm flex-1">
                    {aiEmailColumns.map((col, idx) =>
                      typeof col === "string" ? (
                        <li key={col}>{col}</li>
                      ) : (
                        <li key={col.name ?? idx}>{col.name}</li>
                      )
                    )}

                </ul>
              </div>
            )}

            {generateDataQualitySummary(modifiedHeaders, processedData).lowValueColumns.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6 flex flex-col h-full min-h-[220px]">
                <h3 className="text-lg font-semibold mb-4">Low-Value Columns (&gt;30% missing)</h3>
                <ul className="list-disc ml-5 text-sm flex-1">
                  {generateDataQualitySummary(modifiedHeaders, processedData).lowValueColumns.map((col) => (
                    <li key={col}>{col}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiCurrencyColumns.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6 flex flex-col h-full min-h-[220px]">
                <h3 className="text-lg font-semibold mb-4">💰 Currency Columns Detected</h3>
                <ul className="list-disc ml-5 text-sm flex-1">
                    {aiCurrencyColumns.map((col, idx) => {
                      if (typeof col === "string") {
                        return (
                          <li key={col}>
                            {col}
                          </li>
                        )
                      } else if (col && typeof col === "object" && "name" in col) {
                        return (
                          <li key={col.name ?? idx}>
                            {col.name}
                            {col.currency ? (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({col.currency})
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                (col.currency)
                              </span>
                            )}
                          </li>
                        )
                      } else {
                        return null
                      }
                    })}
                </ul>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handlePreprocess}
              className="flex items-center gap-2"
              disabled={isProcessing}
            >
              <Cpu className="h-4 w-4" />
              {isProcessing ? "Processing..." : "Preprocess Data"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preprocessed Data Dashboard */}
      {currentStep === 3 && (
        <div className="flex flex-col flex-1 overflow-auto bg-gray-50 p-6">
          
          {/* Upload Button on Top */}
          <div className="flex justify-end mb-6">
            <form onSubmit={handleSubmit}>
              <Button
                type="submit"
                disabled={uploading}
                className="bg-black text-white px-4 py-2 rounded"
              >
                {uploading ? "Uploading..." : "Upload Processed File"}
              </Button>
            </form>
          </div>

          <div className="max-w-full mx-auto space-y-6">

            {/* Cards Section */}
            {processedData.length > 0 && (() => {
              const dq = generateDataQualitySummary(modifiedHeaders, processedData)
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">

                  {/* Card 1: Data Statistics */}
                  <div className="bg-white rounded-lg shadow p-4 flex flex-col space-y-2 text-black">
                    <h2 className="text-md font-semibold mb-2 border-b border-gray-300 pb-1">Data Statistics</h2>
                    <p><strong>Final Rows:</strong> {dq.totalRows}</p>
                    <p><strong>Final Columns:</strong> {dq.totalColumns}</p>
                    <p><strong>Empty Rows:</strong> {dq.emptyRowCount}</p>
                    <p><strong>Duplicate Rows:</strong> {dq.duplicateCount}</p>
                    <p><strong>Rows with Missing Values:</strong> {dq.rowsWithMissingValues}</p>
                  </div>

                  {/* Card 2: Data Improvements */}
                  <div className="bg-white rounded-lg shadow p-4 flex flex-col space-y-2 text-black">
                    <h2 className="text-md font-semibold mb-2 border-b border-gray-300 pb-1">Data Improvements</h2>
                    <ul className="list-disc ml-4">
                      {aiEmailColumns.map((col, idx) => (
                        <li key={typeof col === "string" ? col : col.name ?? idx}>
                          {typeof col === "string" ? `${col} column removed` : `${col.name} column removed`}
                        </li>
                      ))}
                        {aiCurrencyColumns.length > 0 && (
                        <li>
                          {aiCurrencyColumns.length === 1
                          ? `Currency column "${typeof aiCurrencyColumns[0] === "string" ? aiCurrencyColumns[0] : aiCurrencyColumns[0].name}" cleaned`
                          : `Currency columns cleaned: ${aiCurrencyColumns
                            .map((col) =>
                              typeof col === "string" ? `"${col}"` : `"${col.name}"`
                            )
                            .join(", ")}`}
                        </li>
                        )}
                        {dq.duplicateCount > 0 && <li>{dq.duplicateCount} duplicate rows removed</li>}
                        {dq.lowValueColumns.length > 0 && (
                          <li>
                          Low-value columns removed (&gt;30% missing):{" "}
                          {dq.lowValueColumns.map((col) => `"${col}"`).join(", ")}
                          </li>
                        )}
                        {importantColumns.length > 0 &&
                          dq.lowValueColumns.some((col) => importantColumns.includes(col)) && (
                          <li className="text-red-600">
                          Warning: Some important columns were removed due to high missing values. Please check your data and consider re-submitting after fixing missing values.
                          </li>
                        )}
                    </ul>
                  </div>

                    {/* Card 3: Data Quality Chart */}
                    <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center text-black">
                    <h2 className="text-md font-semibold mb-2 border-b border-gray-300 pb-1">Data Quality Chart</h2>
                    {pieData && (
                      <div className="w-full flex justify-center">
                      <div style={{ width: 220, height: 220 }}>
                        <Pie data={pieData} />
                      </div>
                      </div>
                    )}
                    {dq.duplicateCount === 0 && (
                      <p className="text-center mt-2 text-sm">No duplicate rows remaining</p>
                    )}
                    </div>

                </div>
              )
            })()}

            {/* AI Summary */}
            {aiSummary && (
              <div className="bg-white rounded-lg shadow p-4 mt-4 text-black">
                <h2 className="text-md font-semibold mb-2 border-b border-gray-300 pb-1">AI Summary</h2>
                <p className="whitespace-pre-line text-sm">{aiSummary}</p>
              </div>
            )}

            {/* Preview Section - First 20 Rows */}
            {processedData.length > 0 && (
              <div className="flex flex-col p-4 bg-white rounded-lg shadow mt-4 w-full">
                <h3 className="font-semibold mb-2 border-b border-gray-300 pb-1">Preview (First 20 Rows)</h3>
                <div className="max-h-[400px] overflow-auto">
                  <table className="min-w-full table-auto text-sm border-collapse">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        {modifiedHeaders.map((header) => (
                          <th key={header} className="px-2 py-1 text-left">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processedData.slice(0, 20).map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                          {modifiedHeaders.map((header) => (
                            <td key={header} className="px-2 py-1">
                              {row[header] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  )
}
