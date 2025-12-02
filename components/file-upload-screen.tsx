"use client"

import React, { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText, ArrowLeft, Cpu, AlertTriangle, Edit2, Trash2, Plus, X, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { processDateColumns } from "@/lib/date-utils"
import { Pie, Bar } from "react-chartjs-2"
import Papa from "papaparse"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

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
  const [urlColumns, setUrlColumns] = useState<string[]>([])
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null)
  const [deleteColumnDialog, setDeleteColumnDialog] = useState<{ open: boolean; column: string; percentage: number; isImportant: boolean }>({ open: false, column: "", percentage: 0, isImportant: false })
  const [columnsToAutoRemove, setColumnsToAutoRemove] = useState<string[]>([])
  const [privacyColumnsToRemove, setPrivacyColumnsToRemove] = useState<string[]>([])
  const [urlColumnsToRemove, setUrlColumnsToRemove] = useState<string[]>([])

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

  // URL detection function
  const detectUrlColumns = (headers: string[], data: Record<string, any>[]): string[] => {
    const urlPattern = /^(https?:\/\/|www\.|ftp:\/\/|mailto:)/i
    const detectedColumns: string[] = []
    
    headers.forEach((header) => {
      // Check if column name suggests URL
      const headerLower = header.toLowerCase()
      if (headerLower.includes('url') || headerLower.includes('link') || headerLower.includes('website') || headerLower.includes('web')) {
        detectedColumns.push(header)
        return
      }
      
      // Check sample values for URL patterns
      const sampleValues = data.slice(0, 10).map(row => row[header]).filter(v => v != null && v !== "")
      if (sampleValues.length > 0) {
        const urlCount = sampleValues.filter(v => {
          const str = String(v).trim()
          return urlPattern.test(str) || str.includes('http://') || str.includes('https://')
        }).length
        
        // If more than 50% of sample values look like URLs, mark as URL column
        if (urlCount / sampleValues.length > 0.5) {
          detectedColumns.push(header)
        }
      }
    })
    
    return detectedColumns
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
    aiOutput: { emailColumns?: { name: string; type: string }[]; currencyColumns?: { name: string; currency: string }[] },
    urlColumnsToRemove: string[] = []
  ) => {
    let processedData = [...data]
    let processedHeaders = [...headers]

    // Remove URL columns (don't send to AI)
    if (urlColumnsToRemove.length > 0) {
      processedHeaders = processedHeaders.filter((h) => !urlColumnsToRemove.includes(h))
      processedData = processedData.map((row) => {
        const newRow: Record<string, any> = {}
        processedHeaders.forEach((h) => (newRow[h] = row[h]))
        return newRow
      })
    }

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

    // Process date columns - detect and split combined date columns
    const dateProcessingResult = processDateColumns(processedHeaders, processedData)
    processedHeaders = dateProcessingResult.newHeaders
    processedData = dateProcessingResult.newData
    
    // Log date column processing results
    if (dateProcessingResult.dateColumnsProcessed.length > 0) {
      console.log(`✅ Date preprocessing completed: ${dateProcessingResult.dateColumnsProcessed.length} columns split into year/month/day components`)
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
    
    // Detect URL columns
    const detectedUrlColumns = detectUrlColumns(headers, rows)
    setUrlColumns(detectedUrlColumns)
    
    // Remove URL columns before sending to AI
    const headersWithoutUrls = headers.filter(h => !detectedUrlColumns.includes(h))
    const rowsWithoutUrls = rows.map(row => {
      const newRow: Record<string, any> = {}
      headersWithoutUrls.forEach(h => (newRow[h] = row[h]))
      return newRow
    })
    
    setModifiedHeaders(headers)
    setProcessedData(rows)
    setSampleRows(rows.slice(0, 5))

    setLoadingAI(true)
    try {
      const res = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: headersWithoutUrls, rows: rowsWithoutUrls.slice(0, 5) }),
      })
      const data = await res.json()
      console.log("AI Summary response:", data)
      setAiSummary(data.summary || "No summary available")
      setImportantColumns(data.importantColumns || [])
      setIrrelevantColumns(data.irrelevantColumns || [])
      
      const emailCols = data.emailColumns || []
      setAiEmailColumns(emailCols)
      
      // Auto-select all detected URL and privacy columns for removal
      setUrlColumnsToRemove(detectedUrlColumns)
      const privacyCols = emailCols.map((col: any) => 
        typeof col === "string" ? col : col.name
      )
      setPrivacyColumnsToRemove(privacyCols)

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
    
    // Auto-remove columns with <5% missing values
    const dq = generateDataQualitySummary(modifiedHeaders, processedData)
    const autoRemoveColumns: string[] = []
    
    modifiedHeaders.forEach(header => {
      const missingCount = dq.missingValueSummary[header] || 0
      const percentage = (missingCount / dq.totalRows) * 100
      if (percentage > 0 && percentage < 5) {
        autoRemoveColumns.push(header)
      }
    })
    
    setColumnsToAutoRemove(autoRemoveColumns)
    
    // Check for columns with >5% missing values
    const highMissingColumns: Array<{ name: string; percentage: number }> = []
    
    modifiedHeaders.forEach(header => {
      const missingCount = dq.missingValueSummary[header] || 0
      const percentage = (missingCount / dq.totalRows) * 100
      if (percentage >= 5) {
        highMissingColumns.push({ name: header, percentage })
      }
    })
    
    // If there are columns with >5% missing, show dialog for first one
    if (highMissingColumns.length > 0) {
      const firstColumn = highMissingColumns[0]
      setDeleteColumnDialog({ 
        open: true, 
        column: firstColumn.name, 
        percentage: firstColumn.percentage,
        isImportant: importantColumns.includes(firstColumn.name)
      })
      return
    }
    
    // No high missing columns, proceed with preprocessing
    performPreprocessing()
  }

  const performPreprocessing = () => {
    setIsProcessing(true)
    
    // Combine all columns to remove (privacy, URLs, and auto-removed low missing columns)
    const allColumnsToRemove = [...privacyColumnsToRemove, ...urlColumnsToRemove, ...columnsToAutoRemove]
    
    // Filter out removed columns from email/currency lists
    const emailColsToProcess = aiEmailColumns
      .map((col) => typeof col === "string" ? { name: col, type: col.toLowerCase().includes("mobile") ? "mobile" : "email" } : col)
      .filter((col: any) => !allColumnsToRemove.includes(typeof col === "string" ? col : col.name))
    
    const result = preprocessData(modifiedHeaders, processedData, {
      emailColumns: emailColsToProcess,
      currencyColumns: aiCurrencyColumns.map((col) =>
      typeof col === "string"
        ? { name: col, currency: "unknown" }
        : col 
      ),
    }, urlColumnsToRemove)
    setModifiedHeaders(result.processedHeaders)
    setProcessedData(result.processedData)
    setSummary(generateDataQualitySummary(result.processedHeaders, result.processedData))
    
    setIsProcessing(false)
    setIsDataProcessed(true)
    setAiSummary((prev) => prev)
    setCurrentStep(3)
    setColumnsToAutoRemove([])
  }

  const handleDeleteColumn = (column: string) => {
    const newHeaders = modifiedHeaders.filter(h => h !== column)
    const newData = processedData.map(row => {
      const newRow = { ...row }
      delete newRow[column]
      return newRow
    })
    setModifiedHeaders(newHeaders)
    setProcessedData(newData)
    setSummary(generateDataQualitySummary(newHeaders, newData))
    setDeleteColumnDialog({ open: false, column: "", percentage: 0, isImportant: false })
  }

  const handleEditMissingValue = (column: string, rowIndex: number, newValue: string) => {
    const newData = [...processedData]
    newData[rowIndex] = { ...newData[rowIndex], [column]: newValue }
    setProcessedData(newData)
    setSummary(generateDataQualitySummary(modifiedHeaders, newData))
    setEditingColumn(null)
    setEditingRowIndex(null)
  }

  const handleAddMissingValue = (column: string, rowIndex: number, newValue: string) => {
    handleEditMissingValue(column, rowIndex, newValue)
  }

  const getRowsWithMissingValues = (column: string): number[] => {
    const rows: number[] = []
    processedData.forEach((row, index) => {
      const val = row[column]
      if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
        rows.push(index)
      }
    })
    return rows
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
            backgroundColor: ["#000000", "#9ca3af"],
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
              backgroundColor: "#6b7280",
            },
          ],
        }
      })()
    : null

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center">
          <Button variant="ghost" onClick={handleBackToPreviousStep} className="mr-3">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">
            {currentStep === 1 && "Upload CSV"}
            {currentStep === 2 && "Data Summary"}
            {currentStep === 3 && "Preprocessed Data"}
          </h1>
        </div>
        {currentStep === 1 && (
          <Button
            onClick={handleNextToSummary}
            disabled={!file || !name.trim() || loadingAI}
            className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white"
          >
            {loadingAI ? "Processing..." : "Next"}
          </Button>
        )}
        {currentStep === 2 && (
          <Button
            onClick={handlePreprocess}
            className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white shadow-lg"
            disabled={isProcessing}
            size="lg"
          >
            <Cpu className="h-4 w-4" />
            {isProcessing ? "Processing..." : "Preprocess Data"}
          </Button>
        )}
      </div>

      {/* Step 1: File Upload */}
      {currentStep === 1 && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Upload and Form section - Two columns side by side */}
          <div className="flex-1 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto h-full">
              {/* Left Column: File Upload */}
              <div className="flex flex-col">
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors flex-1 flex flex-col justify-center items-center",
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
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <FileText className="h-12 w-12 text-green-600" />
                      <div className="text-center">
                        <p className="font-medium text-lg">{file.name}</p>
                        <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Drop your CSV file here</p>
                        <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: File Name and Description */}
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="name">File Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter file name"
                    required
                    className="h-12"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Meta Data</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter file description (optional)"
                    rows={4}
                    className="resize-none text-sm"
                  />
                </div>
              </div>
            </div>
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
        <div className="flex flex-col flex-1 overflow-hidden bg-white">
          <div className="flex-1 overflow-y-auto p-6">

          {/* Top Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {/* Total Rows */}
            <div className="bg-white border border-gray-200 shadow-lg rounded-xl p-5 flex flex-col justify-between hover:shadow-xl transition-shadow">
              <p className="text-gray-600 text-sm font-medium mb-2">Total Rows</p>
              <p className="text-3xl font-bold text-black">{generateDataQualitySummary(modifiedHeaders, processedData).totalRows}</p>
            </div>

            {/* Total Columns */}
            <div className="bg-white border border-gray-200 shadow-lg rounded-xl p-5 flex flex-col justify-between hover:shadow-xl transition-shadow">
              <p className="text-gray-600 text-sm font-medium mb-2">Total Columns</p>
              <p className="text-3xl font-bold text-black">{generateDataQualitySummary(modifiedHeaders, processedData).totalColumns}</p>
            </div>

            {/* Empty Rows */}
            <div className="bg-white border border-gray-200 shadow-lg rounded-xl p-5 flex flex-col justify-between hover:shadow-xl transition-shadow">
              <p className="text-gray-600 text-sm font-medium mb-2">Empty Rows</p>
              <p className="text-3xl font-bold text-black">{generateDataQualitySummary(modifiedHeaders, processedData).emptyRowCount}</p>
            </div>

            {/* Duplicate Rows */}
            <div className="bg-white border border-gray-200 shadow-lg rounded-xl p-5 flex flex-col justify-between hover:shadow-xl transition-shadow">
              <p className="text-gray-600 text-sm font-medium mb-2">Duplicate Rows</p>
              <p className="text-3xl font-bold text-black">{generateDataQualitySummary(modifiedHeaders, processedData).duplicateCount}</p>
            </div>

            {/* Rows with Missing Values */}
            <div className="bg-white border border-red-200 shadow-lg rounded-xl p-5 flex flex-col justify-between hover:shadow-xl transition-shadow">
              <p className="text-red-600 text-sm font-medium mb-2">Rows with Missing Values</p>
              <p className="text-3xl font-bold text-red-600">{generateDataQualitySummary(modifiedHeaders, processedData).rowsWithMissingValues}</p>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Duplicate vs Unique Pie */}
            {pieData && (
              <div className="bg-white shadow-lg rounded-xl p-6 flex flex-col h-full border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Duplicate vs Unique Rows</h3>
                <div className="flex flex-col h-full">
              <div className="h-48 flex items-center justify-center">
                <Pie data={pieData} />
              </div>
              <div className="flex justify-between mt-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#000000" }} />
                  <span className="text-sm">Duplicates</span>
                  <span className="ml-2 font-semibold">
                {pieData.datasets[0].data[0]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#9ca3af" }} />
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
              <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Missing Values by Column</h3>
                <div className="h-64 overflow-auto">
                  <Bar data={barData} />
                </div>
              </div>
            )}
          </div>

          {/* Privacy & URL Columns Management */}
          {((urlColumns.length > 0) || (aiEmailColumns.length > 0)) && (
            <div className="bg-white shadow-lg rounded-xl p-6 mb-6 border border-gray-200">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-black flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    Privacy & Sensitive Data Management
                  </h3>
                  <span className="text-sm text-gray-600">
                    {urlColumns.length + aiEmailColumns.length} column(s) detected
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  These columns will be automatically removed and not sent to AI for analysis. This helps protect sensitive information like emails, phone numbers, and URLs.
                </p>
              </div>

              <div className="space-y-4">
                {/* URL Columns */}
                {urlColumns.length > 0 && (
                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-black mb-3">
                      URL Columns Detected
                    </h4>
                    <div className="space-y-2">
                      {urlColumns.map((column) => {
                        const sampleValue = processedData.find(row => row[column])?.[column] || "N/A"
                        return (
                          <div
                            key={column}
                            className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50"
                          >
                            <div className="flex-1">
                              <p className="font-medium text-black">{column}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Sample: {String(sampleValue).substring(0, 50)}{String(sampleValue).length > 50 ? "..." : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600 font-medium">Will be removed</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Email & Phone Columns */}
                {aiEmailColumns.length > 0 && (
                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
                    <h4 className="font-semibold text-black mb-3">
                      Email & Phone Number Columns Detected
                    </h4>
                    <div className="space-y-2">
                      {aiEmailColumns.map((col, idx) => {
                        const column = typeof col === "string" ? col : col.name
                        const type = typeof col === "string" 
                          ? (col.toLowerCase().includes("mobile") || col.toLowerCase().includes("phone") ? "phone" : "email")
                          : (col.type === "mobile" ? "phone" : "email")
                        const sampleValue = processedData.find(row => row[column])?.[column] || "N/A"
                        
                        return (
                          <div
                            key={column}
                            className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-black">{column}</p>
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                                  {type === "phone" ? "Phone" : "Email"}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                Sample: {String(sampleValue).substring(0, 50)}{String(sampleValue).length > 50 ? "..." : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600 font-medium">Will be removed</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interactive Missing Values Section */}
          {(() => {
            const dq = generateDataQualitySummary(modifiedHeaders, processedData)
            const missingCols = Object.entries(dq.missingValueSummary)
              .filter(([_, count]) => count > 0)
              .map(([col, count]) => ({
                column: col,
                count,
                percentage: (count / dq.totalRows) * 100,
                rows: getRowsWithMissingValues(col)
              }))
              .sort((a, b) => b.count - a.count)

            if (missingCols.length === 0) return null

            return (
              <div className="bg-white shadow-lg rounded-xl p-6 mb-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-black flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    Missing Values Management
                  </h3>
                  <span className="text-sm text-gray-600">{missingCols.length} column(s) with missing values</span>
                </div>

                <div className="space-y-4">
                  {missingCols.map(({ column, count, percentage, rows }) => {
                    const isAutoRemove = percentage > 0 && percentage < 5
                    const needsUserDecision = percentage >= 5
                    
                    return (
                      <div
                        key={column}
                        className={cn(
                          "border rounded-lg p-4 transition-all hover:shadow-md",
                          isAutoRemove ? "border-gray-200 bg-gray-50" : 
                          needsUserDecision ? "border-red-300 bg-red-50" : 
                          "border-gray-200 bg-white"
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <h4 className="font-semibold text-black">{column}</h4>
                              <p className="text-sm text-gray-600">
                                {count} missing values ({percentage.toFixed(1)}%)
                                {isAutoRemove && (
                                  <span className="ml-2 text-xs text-gray-500">(Will be auto-removed)</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isAutoRemove ? (
                              <span className="text-xs text-gray-600 font-medium">Auto-remove</span>
                            ) : needsUserDecision ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteColumnDialog({ 
                                  open: true, 
                                  column, 
                                  percentage,
                                  isImportant: importantColumns.includes(column)
                                })}
                                className="text-red-600 border-red-300 hover:bg-red-100"
                              >
                                <AlertTriangle className="h-4 w-4 mr-1" />
                                Handle Missing Values
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (editingColumn === column) {
                                    setEditingColumn(null)
                                    setEditingRowIndex(null)
                                  } else {
                                    setEditingColumn(column)
                                    setEditingRowIndex(rows[0] || null)
                                  }
                                }}
                                className="text-green-600 border-green-300 hover:bg-green-50"
                              >
                                <Edit2 className="h-4 w-4 mr-1" />
                                {editingColumn === column ? "Cancel Edit" : "Edit Values"}
                              </Button>
                            )}
                          </div>
                        </div>

                        {editingColumn === column && !isAutoRemove && !needsUserDecision && (
                        <div className="mt-4 space-y-2 border-t pt-3">
                          <p className="text-sm font-medium text-gray-700 mb-2">
                            Edit missing values ({rows.length} rows):
                          </p>
                          <div className="max-h-48 overflow-y-auto space-y-2">
                            {rows.slice(0, 20).map((rowIndex) => (
                              <div key={rowIndex} className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 w-16">Row {rowIndex + 1}:</span>
                                {editingRowIndex === rowIndex ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <Input
                                      defaultValue={processedData[rowIndex][column] || ""}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          handleEditMissingValue(column, rowIndex, e.currentTarget.value)
                                        } else if (e.key === "Escape") {
                                          setEditingRowIndex(null)
                                        }
                                      }}
                                      className="flex-1 h-8 text-sm"
                                      autoFocus
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        const input = e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement
                                        if (input) handleEditMissingValue(column, rowIndex, input.value)
                                      }}
                                      className="h-8 w-8 p-0"
                                    >
                                      <Check className="h-4 w-4 text-green-600" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingRowIndex(null)}
                                      className="h-8 w-8 p-0"
                                    >
                                      <X className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className="flex-1 text-sm text-gray-400 italic">(empty)</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingRowIndex(rowIndex)}
                                      className="h-8 px-2 text-xs"
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Add Value
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                            {rows.length > 20 && (
                              <p className="text-xs text-gray-500 italic">
                                ... and {rows.length - 20} more rows. Edit first 20 rows here.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* AI Summary Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {aiEmailColumns.length > 0 && (
              <div className="bg-white shadow-lg rounded-xl p-6 flex flex-col h-full min-h-[220px] border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Privacy Details Detected</h3>
                <ul className="list-disc ml-5 text-sm flex-1 space-y-1">
                    {aiEmailColumns.map((col, idx) =>
                      typeof col === "string" ? (
                        <li key={col} className="text-gray-700">{col}</li>
                      ) : (
                        <li key={col.name ?? idx} className="text-gray-700">{col.name}</li>
                      )
                    )}

                </ul>
              </div>
            )}

            {generateDataQualitySummary(modifiedHeaders, processedData).lowValueColumns.length > 0 && (
              <div className="bg-white shadow-lg rounded-xl p-6 flex flex-col h-full min-h-[220px] border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Low-Value Columns (&gt;30% missing)</h3>
                <ul className="list-disc ml-5 text-sm flex-1 space-y-1">
                  {generateDataQualitySummary(modifiedHeaders, processedData).lowValueColumns.map((col) => (
                    <li key={col} className="text-gray-700">{col}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiCurrencyColumns.length > 0 && (
              <div className="bg-white shadow-lg rounded-xl p-6 flex flex-col h-full min-h-[220px] border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">💰 Currency Columns Detected</h3>
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
          </div>
        </div>
      )}

      {/* Missing Values Decision Dialog */}
      <AlertDialog open={deleteColumnDialog.open} onOpenChange={(open) => {
        // Only close the dialog, don't auto-navigate
        if (!open) {
          setDeleteColumnDialog({ open: false, column: "", percentage: 0, isImportant: false })
        }
      }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Missing Values Detected
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-700">
              Column <strong>{deleteColumnDialog.column}</strong> has {deleteColumnDialog.percentage.toFixed(1)}% missing values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="my-4">
            {deleteColumnDialog.isImportant ? (
              <Alert className="bg-red-50 border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800">Important Column</AlertTitle>
                <AlertDescription className="text-red-700">
                  This column is marked as important. Please fill the missing values manually in the "Missing Values Management" section above, then try preprocessing again.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-gray-50 border-gray-300">
                <AlertTriangle className="h-4 w-4 text-gray-600" />
                <AlertTitle className="text-black">Column Not Important</AlertTitle>
                <AlertDescription className="text-gray-700">
                  This column doesn't appear to be critical. You can delete it to proceed with preprocessing.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>
            {deleteColumnDialog.isImportant ? (
              <AlertDialogAction
                onClick={() => {
                  // User acknowledges they need to fill values manually
                  setDeleteColumnDialog({ open: false, column: "", percentage: 0, isImportant: false })
                }}
              >
                I'll Fill Values Manually
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={() => {
                  // Delete the column
                  if (deleteColumnDialog.column) {
                    handleDeleteColumn(deleteColumnDialog.column)
                  }
                  setDeleteColumnDialog({ open: false, column: "", percentage: 0, isImportant: false })
                  // Don't auto-navigate, let user click Preprocess Data button
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete Column
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 3: Preprocessed Data Dashboard */}
      {currentStep === 3 && (
        <div className="flex flex-col flex-1 overflow-auto bg-white p-6">
          
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
