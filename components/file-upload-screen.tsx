"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText, ArrowLeft, Cpu, AlertTriangle, Edit2, Trash2, Plus, X, Check, DollarSign } from "lucide-react"
import { cn, filterIdColumns, filterIdColumnsFromData } from "@/lib/utils"
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
  const [aiDateColumns, setAiDateColumns] = useState<Array<{ name: string; separator?: string; format?: string }>>([])
  const [importantColumns, setImportantColumns] = useState<string[]>([])
  const [irrelevantColumns, setIrrelevantColumns] = useState<string[]>([])
  const [redundantColumns, setRedundantColumns] = useState<string[]>([])
  const [aiModifiedHeaders, setAiModifiedHeaders] = useState<string[]>([])
  const [originalHeadersBeforePreprocessing, setOriginalHeadersBeforePreprocessing] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDataProcessed, setIsDataProcessed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([])
  const [uploading, setUploading] = useState(false)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1) // Step 1: Upload, Step 2: Summary, Step 3: Preprocessed
  const [showUploadWarning, setShowUploadWarning] = useState(false)
  const [urlColumns, setUrlColumns] = useState<string[]>([])
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null)
  const [deleteColumnDialog, setDeleteColumnDialog] = useState<{ open: boolean; column: string; percentage: number; isImportant: boolean }>({ open: false, column: "", percentage: 0, isImportant: false })
  const [missingValueAction, setMissingValueAction] = useState<"removeRows" | "removeColumn">("removeRows")
  const [preprocessConfirmDialog, setPreprocessConfirmDialog] = useState(false)
  const [columnsToAutoRemove, setColumnsToAutoRemove] = useState<string[]>([])
  const [privacyColumnsToRemove, setPrivacyColumnsToRemove] = useState<string[]>([])
  const [urlColumnsToRemove, setUrlColumnsToRemove] = useState<string[]>([])
  // Store original data before preprocessing to restore when going back
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([])
  const [originalData, setOriginalData] = useState<Record<string, any>[]>([])

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
    aiOutput: { personalColumns?: { name: string; type: string }[]; currencyColumns?: { name: string; currency: string }[]; dateColumns?: Array<{ name: string; separator?: string; format?: string }> },
    urlColumnsToRemove: string[] = []
  ) => {
    // Filter out 'id' columns first (conflicts with PRIMARY KEY)
    const { filteredHeaders: headersWithoutId, idColumnsRemoved } = filterIdColumns(headers);
    let processedData = filterIdColumnsFromData(data, headers, headersWithoutId);
    let processedHeaders = [...headersWithoutId]
    
    if (idColumnsRemoved.length > 0) {
      console.log(`⚠️ Removed ${idColumnsRemoved.length} 'id' column(s) during preprocessing:`, idColumnsRemoved);
    }

    // Remove URL columns first (don't send to AI)
    if (urlColumnsToRemove.length > 0) {
      processedHeaders = processedHeaders.filter((h) => !urlColumnsToRemove.includes(h))
      processedData = processedData.map((row) => {
        const newRow: Record<string, any> = {}
        processedHeaders.forEach((h) => (newRow[h] = row[h]))
        return newRow
      })
    }

    // Remove personal/privacy columns (handle objects with name/type)
    if (aiOutput.personalColumns?.length) {
      const personalColumnNames = aiOutput.personalColumns.map((col) =>
        typeof col === "string" ? col : col.name
      )
      console.log("🔍 Removing personal columns:", personalColumnNames)
      console.log("🔍 Headers before removal:", processedHeaders)
      
      // Filter out any privacy columns that still exist in headers
      processedHeaders = processedHeaders.filter((h) => !personalColumnNames.includes(h))
      
      console.log("🔍 Headers after removal:", processedHeaders)
      
      processedData = processedData.map((row) => {
        const newRow: Record<string, any> = {}
        processedHeaders.forEach((h) => (newRow[h] = row[h]))
        return newRow
      })
    }

    // Clean currency columns and update headers with currency code
    if (aiOutput.currencyColumns?.length) {
      aiOutput.currencyColumns.forEach((col) => {
        const colName = typeof col === "string" ? col : col.name
        const currency = typeof col === "string" ? "USD" : (col.currency || "USD")
        
        // Update header name to include currency code (e.g., "Price (LKR)")
        const newHeaderName = `${colName} (${currency.toUpperCase()})`
        
        const headerIndex = processedHeaders.indexOf(colName)
        if (headerIndex !== -1) {
          processedHeaders[headerIndex] = newHeaderName
        }
      })
      
      processedData = processedData.map((row) => {
        const newRow = { ...row }
        aiOutput.currencyColumns!.forEach((col) => {
          const colName = typeof col === "string" ? col : col.name
          const currency = typeof col === "string" ? "USD" : (col.currency || "USD")
          const newHeaderName = `${colName} (${currency.toUpperCase()})`
          
          if (
            Object.prototype.hasOwnProperty.call(newRow, colName) &&
            newRow[colName] !== undefined &&
            newRow[colName] !== null &&
            newRow[colName] !== ""
          ) {
            const cleanedValue = newRow[colName].toString().replace(/[^0-9.-]+/g, "")
            // Update the key to the new header name
            delete newRow[colName]
            newRow[newHeaderName] = cleanedValue
          }
        })
        return newRow
      })
    }

    // Process date columns - use AI-identified date columns with format info
    if (aiOutput.dateColumns && aiOutput.dateColumns.length > 0) {
      const dateColumnsToProcess = aiOutput.dateColumns.filter(col => processedHeaders.includes(col.name))
      
      for (const dateCol of dateColumnsToProcess) {
        const dateColumn = dateCol.name
        const separator = dateCol.separator || "/"
        const format = dateCol.format || "dmy"
        
        const yearColumn = `${dateColumn}_year`
        const monthColumn = `${dateColumn}_month`
        const dayColumn = `${dateColumn}_day`
        
        const yearValues: (number | null)[] = []
        const monthValues: (number | null)[] = []
        const dayValues: (number | null)[] = []
        
        // Parse each date value based on AI-detected format
        for (let i = 0; i < processedData.length; i++) {
          const value = String(processedData[i][dateColumn] || "").trim()
          let parsed: { year: number | null; month: number | null; day: number | null } = { year: null, month: null, day: null }
          
          if (value) {
            // Handle text-based formats
            if (format === "dmy_text" || format === "mdy_text") {
              const parts = value.split(/\s+/)
              const monthNames: Record<string, number> = {
                jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
                apr: 4, april: 4, may: 5, jun: 6, june: 6,
                jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
                oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
              }
              
              if (format === "dmy_text" && parts.length >= 3) {
                const day = parseInt(parts[0], 10)
                const monthName = parts[1].toLowerCase().replace(/[,.]/g, '')
                const year = parseInt(parts[2], 10)
                const month = monthNames[monthName]
                if (month && day && year) parsed = { year, month, day }
              } else if (format === "mdy_text" && parts.length >= 3) {
                const monthName = parts[0].toLowerCase().replace(/[,.]/g, '')
                const day = parseInt(parts[1].replace(/[,.]/g, ''), 10)
                const year = parseInt(parts[2], 10)
                const month = monthNames[monthName]
                if (month && day && year) parsed = { year, month, day }
              }
            } else {
              // Handle numeric formats
              let parts: string[] = []
              if (separator === " ") {
                parts = value.split(/\s+/).filter(p => p && !isNaN(Number(p)))
              } else {
                const escapeSep = separator === "." ? "\\." : separator === "|" ? "\\|" : separator === "-" ? "\\-" : separator === "/" ? "\\/" : separator
                const match = value.match(new RegExp(`^(\\d+)[${escapeSep}](\\d+)[${escapeSep}](\\d+)$`))
                if (match) {
                  parts = [match[1], match[2], match[3]]
                } else {
                  parts = value.split(separator).filter(p => p && !isNaN(Number(p)))
                }
              }
              
              if (parts.length >= 3) {
                const p1 = parseInt(parts[0], 10)
                const p2 = parseInt(parts[1], 10)
                const p3 = parseInt(parts[2], 10)
                
                if (format === "dmy") parsed = { year: p3, month: p2, day: p1 }
                else if (format === "mdy") parsed = { year: p3, month: p1, day: p2 }
                else if (format === "ymd") parsed = { year: p1, month: p2, day: p3 }
              }
            }
          }
          
          yearValues.push(parsed.year)
          monthValues.push(parsed.month)
          dayValues.push(parsed.day)
        }
        
        // Remove original date column
        const originalIndex = processedHeaders.indexOf(dateColumn)
        if (originalIndex !== -1) processedHeaders.splice(originalIndex, 1)
        
        // Add new date columns
        processedHeaders.push(yearColumn, monthColumn, dayColumn)
        
        // Update data rows
        processedData.forEach((row, index) => {
          delete row[dateColumn]
          row[yearColumn] = yearValues[index]
          row[monthColumn] = monthValues[index]
          row[dayColumn] = dayValues[index]
        })
      }
      
      console.log(`✅ Date preprocessing completed: ${dateColumnsToProcess.length} AI-identified date columns split into year/month/day components`)
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
    // Store original data for restoration when going back
    setOriginalHeaders(headers)
    setOriginalData(rows)

    setLoadingAI(true)
    try {
      const res = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: headersWithoutUrls, rows: rowsWithoutUrls.slice(0, 5) }),
      })
      const data = await res.json()
      console.log("AI Analysis response:", data)
      // Summary is no longer generated - removed to save tokens
      setImportantColumns(data.importantColumns || [])
      setIrrelevantColumns(data.irrelevantColumns || [])
      setRedundantColumns(data.redundantColumns || [])
      setAiModifiedHeaders(data.modifiedHeaders || headers)
      
      const personalCols = data.personalColumns || []
      setAiEmailColumns(personalCols)
      
      // Auto-select all detected URL and privacy columns for removal
      setUrlColumnsToRemove(detectedUrlColumns)
      const privacyCols = personalCols.map((col: any) => 
        typeof col === "string" ? col : col.name
      )
      setPrivacyColumnsToRemove(privacyCols)

      setAiCurrencyColumns((data.currencyColumns || []).map((c: any) => c.name))
      setAiDateColumns(data.dateColumns || [])
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
    
    // Show confirmation dialog first
    setPreprocessConfirmDialog(true)
  }
  
  const confirmPreprocess = async () => {
    setPreprocessConfirmDialog(false)
    
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
    
    // Store original headers before preprocessing for header mapping
    setOriginalHeadersBeforePreprocessing([...modifiedHeaders])
    
    // Combine all columns to remove (privacy, URLs, and auto-removed low missing columns)
    const allColumnsToRemove = [...privacyColumnsToRemove, ...urlColumnsToRemove, ...columnsToAutoRemove]
    
    // Get ALL privacy columns to remove - include all AI-detected personal columns
    // Don't filter them out, we want to remove ALL of them
    const personalColsToProcess = aiEmailColumns
      .map((col) => typeof col === "string" ? { name: col, type: col.toLowerCase().includes("mobile") ? "mobile" : "email" } : col)
      .filter((col: any) => {
        const colName = typeof col === "string" ? col : col.name
        // Only exclude if it's in the auto-remove list (low missing), but keep URLs and privacy columns
        return !columnsToAutoRemove.includes(colName)
      })
    
    console.log("🔍 Preprocessing - Privacy columns to remove:", personalColsToProcess.map(c => typeof c === "string" ? c : c.name))
    console.log("🔍 Preprocessing - URL columns to remove:", urlColumnsToRemove)
    
    const result = preprocessData(modifiedHeaders, processedData, {
      personalColumns: personalColsToProcess,
      currencyColumns: aiCurrencyColumns.map((col) =>
      typeof col === "string"
        ? { name: col, currency: "unknown" }
        : col 
      ),
      dateColumns: aiDateColumns,
    }, urlColumnsToRemove)
    
    // After preprocessing, remove irrelevant and redundant columns
    let finalHeaders = [...result.processedHeaders]
    let finalData = [...result.processedData]
    
    // Combine all columns to remove
    const columnsToRemove = [
      ...irrelevantColumns,
      ...redundantColumns
    ].filter(col => finalHeaders.includes(col))
    
    console.log("🔍 Removing irrelevant/redundant columns:", columnsToRemove)
    
    // Remove irrelevant and redundant columns
    if (columnsToRemove.length > 0) {
      finalHeaders = finalHeaders.filter((h) => !columnsToRemove.includes(h))
      finalData = finalData.map((row) => {
        const newRow: Record<string, any> = {}
        finalHeaders.forEach((h) => (newRow[h] = row[h]))
        return newRow
      })
    }
    
    // Apply header modifications if modifiedHeaders are provided
    // Create a mapping from original headers (before preprocessing) to modified headers
    const originalHeaders = originalHeadersBeforePreprocessing.length > 0 
      ? originalHeadersBeforePreprocessing 
      : modifiedHeaders // Fallback to current if not stored
      
    if (aiModifiedHeaders.length > 0 && aiModifiedHeaders.length === originalHeaders.length) {
      const headerMapping: Record<string, string> = {}
      
      originalHeaders.forEach((original, index) => {
        if (aiModifiedHeaders[index] && original !== aiModifiedHeaders[index]) {
          headerMapping[original] = aiModifiedHeaders[index]
        }
      })
      
      console.log("🔍 Header mapping (original -> modified):", headerMapping)
      console.log("🔍 Current headers after preprocessing:", finalHeaders)
      
      // Apply mappings to current headers
      // We need to map from original header names to modified header names
      finalHeaders = finalHeaders.map(h => {
        // Check if this header (or its base name) needs to be modified
        // First, try to find exact match
        if (headerMapping[h]) {
          return headerMapping[h]
        }
        
        // Try removing currency suffix and date suffix
        const baseHeader = h.replace(/\s*\([A-Z]+\)\s*$/, '').replace(/_year$|_month$|_day$/, '')
        if (headerMapping[baseHeader]) {
          // If it's a date column, preserve the suffix
          if (h.includes('_year') || h.includes('_month') || h.includes('_day')) {
            const suffix = h.includes('_year') ? '_year' : h.includes('_month') ? '_month' : '_day'
            return headerMapping[baseHeader] + suffix
          }
          // If it's a currency column, the mapping should already include the currency
          return headerMapping[baseHeader]
        }
        
        return h
      })
      
      // Update data rows with new header names
      finalData = finalData.map((row) => {
        const newRow: Record<string, any> = {}
        finalHeaders.forEach((newHeader) => {
          // Find which original header this new header came from
          let sourceHeader = newHeader
          
          // Check if this is a mapped header
          const mappedOriginal = Object.keys(headerMapping).find(
            orig => {
              const mapped = headerMapping[orig]
              if (mapped === newHeader) return true
              // Handle date columns
              if (newHeader.endsWith('_year') || newHeader.endsWith('_month') || newHeader.endsWith('_day')) {
                const suffix = newHeader.endsWith('_year') ? '_year' : newHeader.endsWith('_month') ? '_month' : '_day'
                return mapped + suffix === newHeader
              }
              return false
            }
          )
          
          if (mappedOriginal) {
            // If it's a date column, find the original date column name
            if (newHeader.endsWith('_year') || newHeader.endsWith('_month') || newHeader.endsWith('_day')) {
              const suffix = newHeader.endsWith('_year') ? '_year' : newHeader.endsWith('_month') ? '_month' : '_day'
              sourceHeader = mappedOriginal + suffix
            } else {
              sourceHeader = mappedOriginal
            }
          }
          
          // Try to get value from source header or new header
          newRow[newHeader] = row[newHeader] ?? row[sourceHeader] ?? ""
        })
        return newRow
      })
      
      console.log("🔍 Final headers after modification:", finalHeaders)
    }
    
    console.log("🔍 Final headers after cleanup:", finalHeaders)
    console.log("🔍 Final data rows:", finalData.length)
    
    setModifiedHeaders(finalHeaders)
    setProcessedData(finalData)
    setSummary(generateDataQualitySummary(finalHeaders, finalData))
    
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

  const getColumnStats = (column: string) => {
    const values = processedData.map(row => row[column]).filter(val => 
      val !== null && val !== undefined && val !== ""
    )
    const uniqueValues = new Set(values.map(v => String(v))).size
    const missingCount = processedData.length - values.length
    const missingPercentage = ((missingCount / processedData.length) * 100).toFixed(1)
    
    // Determine data type
    const numericCount = values.filter(v => !isNaN(Number(v)) && v !== "").length
    const dateCount = values.filter(v => {
      if (typeof v === "string") {
        return !isNaN(Date.parse(v)) || /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{2}\/\d{2}\/\d{4}/.test(v)
      }
      return false
    }).length
    
    let dataType = "text"
    if (dateCount > values.length * 0.7) {
      dataType = "date"
    } else if (numericCount > values.length * 0.7) {
      dataType = "numeric"
    }
    
    return {
      uniqueValues,
      missingCount,
      missingPercentage,
      dataType
    }
  }

  const handleNextToSummary = () => {
    if (file && name.trim()) {
      setCurrentStep(2)
    }
  }

  /** Handle back to previous step */
  // Prevent page refresh/navigation during upload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploading) {
        e.preventDefault()
        e.returnValue = "File is currently uploading. Please wait and don't refresh or navigate away."
        return e.returnValue
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [uploading])

  const handleBackToPreviousStep = () => {
    if (uploading) {
      setShowUploadWarning(true)
      return
    }
    
    if (currentStep === 3) {
      // Restore original data when going back from preprocessed view
      if (originalHeaders.length > 0 && originalData.length > 0) {
        setModifiedHeaders(originalHeaders)
        setProcessedData(originalData)
        setSummary(generateDataQualitySummary(originalHeaders, originalData))
        setIsDataProcessed(false)
        setIsProcessing(false)
        // Reset columns to auto-remove
        setColumnsToAutoRemove([])
      }
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
            backgroundColor: [
              "rgba(59, 130, 246, 0.8)", // Light blue with transparency
              "rgba(147, 197, 253, 0.8)", // Lighter blue with transparency
            ],
            borderColor: [
              "rgba(59, 130, 246, 1)", // Solid light blue
              "rgba(147, 197, 253, 1)", // Solid lighter blue
            ],
            borderWidth: 2,
            hoverBackgroundColor: [
              "rgba(59, 130, 246, 1)", // Full opacity on hover
              "rgba(147, 197, 253, 1)", // Full opacity on hover
            ],
            hoverBorderColor: [
              "rgba(59, 130, 246, 1)",
              "rgba(147, 197, 253, 1)",
            ],
            hoverBorderWidth: 3,
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
              backgroundColor: "rgba(59, 130, 246, 0.8)", // Light blue
              borderColor: "rgba(59, 130, 246, 1)", // Solid light blue
              borderWidth: 1,
              hoverBackgroundColor: "rgba(59, 130, 246, 1)", // Full opacity on hover
              hoverBorderColor: "rgba(59, 130, 246, 1)",
              hoverBorderWidth: 2,
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
          <Button 
            variant="ghost" 
            onClick={handleBackToPreviousStep} 
            className="mr-3"
            disabled={uploading}
          >
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
        {currentStep === 3 && (
          <form onSubmit={handleSubmit}>
            <Button
              type="submit"
              disabled={uploading}
              className="bg-black text-white px-4 py-2 rounded"
            >
              {uploading ? "Uploading..." : "Upload Processed File"}
            </Button>
          </form>
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
        <div className="flex flex-col flex-1 overflow-hidden bg-white">
          <div className="flex-1 overflow-y-auto p-6">
            {/* Row 1: Upload and Form section - Two columns side by side */}
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
                {/* Left Column: File Upload */}
                <div className="flex flex-col">
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors flex flex-col justify-center items-center min-h-[250px]",
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

            {/* Row 2: Preview section */}
            <div className="mt-6 bg-white border-t pt-6 flex flex-col">
              <h3 className="font-semibold mb-2">Preview (First 20 Rows)</h3>
              <div className="max-h-[300px] overflow-auto border rounded">
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
        </div>
      )}

      {/* Step 2: Dashboard Summary */}
      {currentStep === 2 && (
        <div className="flex flex-col flex-1 overflow-hidden bg-white">
          <div className="flex-1 overflow-y-auto p-6">

          {/* Top Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {/* Total Rows */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between transition-shadow">
              <p className="text-gray-600 text-sm font-medium mb-2">Total Rows</p>
              <p className="text-3xl font-bold text-black">{generateDataQualitySummary(modifiedHeaders, processedData).totalRows}</p>
            </div>

            {/* Total Columns */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between transition-shadow">
              <p className="text-gray-600 text-sm font-medium mb-2">Total Columns</p>
              <p className="text-3xl font-bold text-black">{generateDataQualitySummary(modifiedHeaders, processedData).totalColumns}</p>
            </div>

            {/* Empty Rows */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between transition-shadow">
              <p className="text-gray-600 text-sm font-medium mb-2">Empty Rows</p>
              <p className="text-3xl font-bold text-black">{generateDataQualitySummary(modifiedHeaders, processedData).emptyRowCount}</p>
            </div>

            {/* Duplicate Rows */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between transition-shadow">
              <p className="text-gray-600 text-sm font-medium mb-2">Duplicate Rows</p>
              <p className="text-3xl font-bold text-black">{generateDataQualitySummary(modifiedHeaders, processedData).duplicateCount}</p>
            </div>

            {/* Rows with Missing Values */}
            <div className="bg-white border border-red-200 rounded-xl p-5 flex flex-col justify-between transition-shadow">
              <p className="text-red-600 text-sm font-medium mb-2">Rows with Missing Values</p>
              <p className="text-3xl font-bold text-red-600">{generateDataQualitySummary(modifiedHeaders, processedData).rowsWithMissingValues}</p>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Duplicate vs Unique Pie */}
            {pieData && (
              <div className="bg-white rounded-xl p-6 flex flex-col h-full border border-gray-200">
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
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Missing Values by Column</h3>
                <div className="h-64 overflow-auto">
                  <Bar data={barData} />
                </div>
              </div>
            )}
          </div>

          {/* Privacy & URL Columns Management */}
          {((urlColumns.length > 0) || (aiEmailColumns.length > 0)) && (
            <div className="bg-white rounded-xl p-6 mb-3 border border-gray-200">
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
                  These privacy data columns (URLs, emails, phone numbers, addresses, names) will be automatically removed and not sent to AI for analysis. This helps protect sensitive information.
                </p>
              </div>

              <div className="space-y-4">
                {/* Privacy Data Columns - Combined Display */}
                {(urlColumns.length > 0 || aiEmailColumns.length > 0) && (
                  <div className="rounded-lg p-4 bg-white">

                    <div className="space-y-2">
                      {/* URL Columns */}
                      {urlColumns.map((column) => {
                        const sampleValue = processedData.find(row => row[column])?.[column] || "N/A"
                        const stats = getColumnStats(column)
                        return (
                          <div
                            key={column}
                            className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                              <p className="font-medium text-black">{column}</p>
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                                  URL
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                <span>{stats.uniqueValues} unique</span>
                                <span>•</span>
                                <span>{stats.missingCount} missing ({stats.missingPercentage}%)</span>
                                <span>•</span>
                                <span className="capitalize">{stats.dataType}</span>
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
                      
                      {/* Personal Data Columns (Email, Phone, Address, Names) */}
                      {aiEmailColumns.map((col, idx) => {
                        const column = typeof col === "string" ? col : col.name
                        const type = typeof col === "string" 
                          ? (col.toLowerCase().includes("mobile") || col.toLowerCase().includes("phone") ? "phone" : 
                             col.toLowerCase().includes("address") ? "address" :
                             col.toLowerCase().includes("firstname") || col.toLowerCase().includes("first") ? "firstname" :
                             col.toLowerCase().includes("lastname") || col.toLowerCase().includes("last") ? "lastname" :
                             col.toLowerCase().includes("customer") || col.toLowerCase().includes("name") ? "customername" : "email")
                          : (col.type === "mobile" ? "phone" : 
                             col.type === "address" ? "address" :
                             col.type === "firstname" ? "firstname" :
                             col.type === "lastname" ? "lastname" :
                             col.type === "customername" ? "customername" : "email")
                        const sampleValue = processedData.find(row => row[column])?.[column] || "N/A"
                        const typeLabel = type === "phone" ? "Phone" : 
                                        type === "address" ? "Address" :
                                        type === "firstname" ? "First Name" :
                                        type === "lastname" ? "Last Name" :
                                        type === "customername" ? "Customer Name" : "Email"
                        const stats = getColumnStats(column)
                        
                        return (
                          <div
                            key={column}
                            className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-black">{column}</p>
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                                  {typeLabel}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                <span>{stats.uniqueValues} unique</span>
                                <span>•</span>
                                <span>{stats.missingCount} missing ({stats.missingPercentage}%)</span>
                                <span>•</span>
                                <span className="capitalize">{stats.dataType}</span>
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
              <div className="bg-white rounded-xl p-6 mb-6 border border-gray-200">
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
                                onClick={() => {
                                  setMissingValueAction("removeRows") // Reset to default when opening
                                  setDeleteColumnDialog({ 
                                  open: true, 
                                  column, 
                                  percentage,
                                  isImportant: importantColumns.includes(column)
                                  })
                                }}
                                className="text-red-600 border-red-300 hover:bg-red-100"
                              >
                                <AlertTriangle className="h-4 w-4 mr-1" />
                                Continue
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


          {/* Currency Columns Management */}
            {aiCurrencyColumns.length > 0 && (
            <div className="bg-white rounded-xl p-6 mb-3 border border-gray-200">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-black flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Currency Columns Management
                  </h3>
                  <span className="text-sm text-gray-600">
                    {aiCurrencyColumns.length} column(s) detected
                  </span>
              </div>
                <p className="text-sm text-gray-600 mt-2">
                  These currency columns will be automatically cleaned (removed currency symbols) for better data analysis.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg p-4 bg-white">
                  <div className="space-y-2">
                    {aiCurrencyColumns.map((col, idx) => {
                      const column = typeof col === "string" ? col : (col && typeof col === "object" && "name" in col ? col.name : "")
                      const currency = typeof col === "string" ? "USD" : (col && typeof col === "object" && "currency" in col ? col.currency : "USD")
                      const sampleValue = processedData.find(row => row[column])?.[column] || "N/A"
                      const stats = getColumnStats(column)
                      
                        return (
                        <div
                          key={column || idx}
                          className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-black">{column}</p>
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                                {currency}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                              <span>{stats.uniqueValues} unique</span>
                              <span>•</span>
                              <span>{stats.missingCount} missing ({stats.missingPercentage}%)</span>
                              <span>•</span>
                              <span className="capitalize">{stats.dataType}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Sample: {String(sampleValue).substring(0, 50)}{String(sampleValue).length > 50 ? "..." : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 font-medium">Will be cleaned</span>
                          </div>
                        </div>
                      )
                    })}
              </div>
          </div>
              </div>
            </div>
          )}
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
              {deleteColumnDialog.isImportant && (
                <>
                  <br /><br />
                  This is an <strong>important column</strong>. Please fill in the missing values manually in the "Missing Values Management" section above, or choose an option below.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="my-4 space-y-3">
            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  name="missingValueAction"
                  value="removeRows"
                  checked={missingValueAction === "removeRows"}
                  onChange={(e) => setMissingValueAction(e.target.value as "removeRows" | "removeColumn")}
                  className="w-4 h-4 text-green-600"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">Remove Rows with Missing Values</span>
                  <p className="text-sm text-gray-600">Automatically remove all rows that have missing values in this column</p>
                </div>
              </label>
              
              <label className="flex items-center space-x-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  name="missingValueAction"
                  value="removeColumn"
                  checked={missingValueAction === "removeColumn"}
                  onChange={(e) => setMissingValueAction(e.target.value as "removeRows" | "removeColumn")}
                  className="w-4 h-4 text-red-600"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">Remove Column</span>
                  <p className="text-sm text-gray-600">Remove the entire column from the dataset</p>
                </div>
              </label>
            </div>
            
            {deleteColumnDialog.isImportant && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Important Column</AlertTitle>
                <AlertDescription className="text-amber-700">
                  This column is marked as important. Consider filling missing values manually for best results.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <AlertDialogFooter className="flex flex-col sm:flex-row gap-3">
            <AlertDialogCancel 
              className="w-full sm:w-auto"
                onClick={() => {
                setMissingValueAction("removeRows") // Reset to default
                }}
              >
              Cancel
            </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                if (missingValueAction === "removeRows") {
                  // Remove rows with missing values automatically
                  if (deleteColumnDialog.column) {
                    const rowsToRemove = getRowsWithMissingValues(deleteColumnDialog.column)
                    const newData = processedData.filter((_, index) => !rowsToRemove.includes(index))
                    setProcessedData(newData)
                    setSummary(generateDataQualitySummary(modifiedHeaders, newData))
                    console.log(`✅ Removed ${rowsToRemove.length} rows with missing values in column "${deleteColumnDialog.column}"`)
                  }
                } else if (missingValueAction === "removeColumn") {
                  // Delete the column
                  if (deleteColumnDialog.column) {
                    handleDeleteColumn(deleteColumnDialog.column)
                  }
                }
                
                // Check if there are more columns with missing values that need attention
                const dq = generateDataQualitySummary(modifiedHeaders, processedData)
                const missingCols = Object.entries(dq.missingValueSummary)
                  .filter(([_, count]) => count > 0)
                  .map(([col, count]) => ({
                    column: col,
                    count,
                    percentage: (count / dq.totalRows) * 100,
                    rows: getRowsWithMissingValues(col)
                  }))
                  .filter(({ percentage }) => percentage >= 5) // Only columns with >=5% missing
                  .sort((a, b) => b.count - a.count)
                
                // Find the next column that needs attention (excluding the one we just handled)
                const nextColumn = missingCols.find(col => col.column !== deleteColumnDialog.column)
                
                if (nextColumn) {
                  // Show dialog for next column
                  setDeleteColumnDialog({ 
                    open: true, 
                    column: nextColumn.column, 
                    percentage: nextColumn.percentage,
                    isImportant: importantColumns.includes(nextColumn.column)
                  })
                  setMissingValueAction("removeRows") // Reset to default
                } else {
                  // No more columns with missing values, proceed with preprocessing
                  setDeleteColumnDialog({ open: false, column: "", percentage: 0, isImportant: false })
                  setMissingValueAction("removeRows") // Reset to default
                  // Trigger preprocessing
                  performPreprocessing()
                }
                }}
              className="w-full sm:w-auto bg-black hover:bg-gray-800"
              >
              Continue
              </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Warning Dialog */}
      <AlertDialog open={showUploadWarning} onOpenChange={setShowUploadWarning}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Upload in Progress
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-700">
              Your file is currently being uploaded. Please wait and do not:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Refresh the page</li>
                <li>Navigate away</li>
                <li>Go back</li>
              </ul>
              <p className="mt-3 font-medium">Please wait for the upload to complete.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setShowUploadWarning(false)}
              className="w-full sm:w-auto bg-black hover:bg-gray-800"
            >
              OK, I'll Wait
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 3: Preprocessed Data Dashboard */}
      {currentStep === 3 && (
        <div className="flex flex-col flex-1 overflow-hidden bg-white">
          <div className="flex-1 overflow-y-auto p-6">

          <div className="max-w-full mx-auto space-y-6">

            {/* Cards Section */}
            {processedData.length > 0 && (() => {
              const dq = generateDataQualitySummary(modifiedHeaders, processedData)
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">

                  {/* Card 1: Data Statistics */}
                  <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col space-y-2 text-black">
                    <h2 className="text-lg font-bold mb-3 text-gray-900">Data Statistics</h2>
                    <p><strong>Final Rows:</strong> {dq.totalRows}</p>
                    <p><strong>Final Columns:</strong> {dq.totalColumns}</p>
                    <p><strong>Empty Rows:</strong> {dq.emptyRowCount}</p>
                    <p><strong>Duplicate Rows:</strong> {dq.duplicateCount}</p>
                    <p><strong>Rows with Missing Values:</strong> {dq.rowsWithMissingValues}</p>
                  </div>

                  {/* Card 2: Data Improvements */}
                  <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col space-y-2 text-black">
                    <h2 className="text-lg font-bold mb-3 text-gray-900">Data Improvements</h2>
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
                    </ul>
                  </div>

                    {/* Card 3: Data Quality Chart */}
                    <div className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col items-center text-black">
                    <h2 className="text-lg font-bold mb-3 text-gray-900">Data Quality Chart</h2>
                    {pieData && (
                      <div className="w-full flex justify-center">
                      <div style={{ width: 220, height: 220 }}>
                        <Pie 
                          data={pieData} 
                          options={{
                            plugins: {
                              legend: {
                                position: 'bottom',
                                labels: {
                                  padding: 15,
                                  font: {
                                    size: 12,
                                    weight: 500
                                  },
                                  usePointStyle: true,
                                  pointStyle: 'circle'
                                }
                              },
                              tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                padding: 12,
                                titleFont: {
                                  size: 14,
                                  weight: 'bold'
                                },
                                bodyFont: {
                                  size: 13
                                },
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderWidth: 1,
                                cornerRadius: 8,
                                displayColors: true
                              }
                            },
                            responsive: true,
                            maintainAspectRatio: true
                          }}
                        />
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

            {/* Preprocessed Data Preview */}
            {isDataProcessed && processedData.length > 0 && modifiedHeaders.length > 0 && (
              <div className="bg-white rounded-xl p-6 border border-gray-200 mt-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Final Preprocessed Data Preview</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This is the final data after preprocessing. Privacy columns (URLs, emails, phone numbers, addresses, names) have been removed, currency columns have been cleaned and labeled with currency codes (e.g., "Price (USD)"), and date columns have been split into year, month, and day components.
                </p>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full table-auto text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        {modifiedHeaders.map((header) => (
                          <th key={header} className="px-3 py-2 border text-left font-semibold">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {processedData.slice(0, 20).map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                          {modifiedHeaders.map((header) => (
                            <td key={header} className="px-3 py-2 border text-gray-700">
                              {row[header] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {processedData.length > 20 && (
                    <p className="text-sm text-gray-500 mt-2 text-center p-2">
                      Showing first 20 rows of {processedData.length} total rows
                    </p>
                  )}
                </div>
              </div>
            )}

          </div>
          </div>
        </div>
      )}

      {/* Preprocess Confirmation Dialog */}
      <AlertDialog open={preprocessConfirmDialog} onOpenChange={setPreprocessConfirmDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <AlertDialogTitle className="text-xl">Confirm Data Preprocessing</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              <p className="mb-3">
                Once you proceed to the next step, you will <strong>not be able to revert</strong> the preprocessing changes.
              </p>
              <p>
                The data will be permanently modified according to the selected preprocessing options.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-3">
            <AlertDialogCancel className="w-full sm:w-auto border-gray-300">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPreprocess} className="w-full sm:w-auto bg-black hover:bg-gray-800 text-white">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
