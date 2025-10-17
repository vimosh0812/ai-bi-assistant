"use client"

import React, { useState, useRef, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, FileText, BarChart3, Table, Database, TrendingUp, Users, DollarSign, Clock, Activity, Cpu, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Pie, Bar, Line, Doughnut } from "react-chartjs-2"
import Papa from "papaparse"
import { OpenAIKPIAnalysis } from "@/types/kpi"
import { KPIChart } from "@/components/kpi-chart"
import { KPICard } from "@/components/kpi-card"
import { createClient } from "@/lib/supabase/client"

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
} from "chart.js"

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement)

interface DataQualitySummary {
  totalRows: number
  totalColumns: number
  duplicateCount: number
  emptyRowCount: number
  missingValueSummary: Record<string, number>
  lowValueColumns: string[]
  rowsWithMissingValues: number
}

export default function AnalyticsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<DataQualitySummary | null>(null)
  const [aiSummary, setAiSummary] = useState<string>("")
  const [dragActive, setDragActive] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [rawData, setRawData] = useState<Record<string, any>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [kpiAnalysis, setKpiAnalysis] = useState<OpenAIKPIAnalysis | null>(null)
  const [loadingKPI, setLoadingKPI] = useState(false)
  const [activeTab, setActiveTab] = useState("upload")
  const [fileDetails, setFileDetails] = useState<any>(null)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const fileId = searchParams.get("fileId")
  const view = searchParams.get("view")

  // Load existing file data when fileId is provided
  useEffect(() => {
    if (fileId && view === "kpi") {
      loadExistingFileData()
    }
  }, [fileId, view])

  const loadExistingFileData = async () => {
    if (!fileId) return
    
    setIsLoadingFile(true)
    try {
      // Get file details
      const { data: fileData, error: fileError } = await supabase
        .from("files")
        .select("*")
        .eq("id", fileId)
        .single()

      if (fileError) {
        console.error("Error loading file:", fileError)
        return
      }

      setFileDetails(fileData)
      setName(fileData.file_name || "")

      // Download and parse CSV
      const { data: csvData, error: csvError } = await supabase.storage
        .from("csv-files")
        .download(fileData.storage_path)

      if (csvError) {
        console.error("Error downloading CSV:", csvError)
        return
      }

      const text = await csvData.text()
      const parsed = Papa.parse(text, { 
        header: true, 
        skipEmptyLines: true,
        transform: (value) => (value ? value.trim() : "")
      })

      const headers = parsed.meta.fields || []
      const rows = parsed.data as Record<string, any>[]

      setHeaders(headers)
      setRawData(rows)
      setSummary(generateDataQualitySummary(headers, rows))

      // Load KPI analysis if it exists
      if (fileData.has_kpi_analysis) {
        loadKpiAnalysis()
      }

      // Set active tab based on view
      if (view === "kpi") {
        setActiveTab("kpi")
      } else {
        setActiveTab("insights")
      }

    } catch (error) {
      console.error("Error loading file data:", error)
    } finally {
      setIsLoadingFile(false)
    }
  }

  const loadKpiAnalysis = async () => {
    if (!fileId) return
    
    try {
      const response = await fetch(`/api/get-kpi-analysis?fileId=${fileId}`)
      const data = await response.json()
      
      if (data.success && data.kpiAnalysis) {
        setKpiAnalysis(data.kpiAnalysis)
      }
    } catch (error) {
      console.error("Error loading KPI analysis:", error)
    }
  }

  const parseCSV: (file: File) => Promise<{ headers: string[]; rows: Record<string, any>[] }> = async (file: File) => {
    const text = await file.text()
    return new Promise<{ headers: string[]; rows: Record<string, any>[] }>((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => (value ? value.trim() : ""),
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

    // Remove email columns
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

    // Remove low-value columns
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

  const handleFileChange = async (selectedFile: File | null) => {
    if (!selectedFile || selectedFile.type !== "text/csv") return
    setFile(selectedFile)
    if (!name) setName(selectedFile.name.replace(".csv", ""))

    const { headers, rows } = await parseCSV(selectedFile)
    setHeaders(headers)
    setRawData(rows)
    setActiveTab("insights")

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
    } catch (err) {
      console.error(err)
      setAiSummary("Failed to generate AI summary")
    } finally {
      setLoadingAI(false)
    }

    setSummary(generateDataQualitySummary(headers, rows))
  }


  const generateKPIAnalysis = async () => {
    if (!rawData.length) return
    
    console.log(`Generating KPI analysis for ${rawData.length} rows of data`);
    console.log("Full dataset will be used for SQL execution, sample data for OpenAI analysis");
    
    setLoadingKPI(true)
    try {
      const res = await fetch("/api/generate-kpi-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          headers: headers, 
          rows: rawData  // Full dataset sent to API
        }),
      })
      const data = await res.json()
      console.log("KPI Analysis response:", data)
      setKpiAnalysis(data)
      setActiveTab("kpi")
    } catch (err) {
      console.error("KPI Analysis error:", err)
    } finally {
      setLoadingKPI(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // You could add a toast notification here
      console.log("SQL query copied to clipboard");
    });
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

  const pieData = rawData.length
    ? {
        labels: ["Duplicates", "Unique"],
        datasets: [
          {
            data: [
              generateDataQualitySummary(headers, rawData).duplicateCount,
              rawData.length -
                generateDataQualitySummary(headers, rawData).duplicateCount,
            ],
            backgroundColor: ["#000", "#0d6efd"],
          },
        ],
      }
    : null

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b">
        {fileId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 mr-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        )}
        <h1 className="text-xl font-semibold">
          {fileId ? `${fileDetails?.file_name || 'File'} Analytics` : 'Analytics Portal'}
        </h1>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {isLoadingFile ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading file data...</p>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Column Insights
            </TabsTrigger>
            <TabsTrigger value="kpi" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              KPI Analysis
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upload CSV for Analysis</CardTitle>
                  <CardDescription>
                    Upload your CSV file to generate AI-powered analytics and insights
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* File Upload */}
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
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

                  {/* File Details */}
                  {file && (
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">File Name</Label>
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Enter file name"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Enter file description (optional)"
                          rows={3}
                        />
                      </div>
                    </div>
                  )}

                </CardContent>
              </Card>

              {/* Data Quality Summary */}
              {summary && (
                <Card>
                  <CardHeader>
                    <CardTitle>Data Quality Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{summary.totalRows}</div>
                        <div className="text-sm text-muted-foreground">Total Rows</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{summary.totalColumns}</div>
                        <div className="text-sm text-muted-foreground">Columns</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">{summary.duplicateCount}</div>
                        <div className="text-sm text-muted-foreground">Duplicates</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">{summary.rowsWithMissingValues}</div>
                        <div className="text-sm text-muted-foreground">Missing Values</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{summary.emptyRowCount}</div>
                        <div className="text-sm text-muted-foreground">Empty Rows</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Summary */}
              {aiSummary && (
                <Card>
                  <CardHeader>
                    <CardTitle>AI Analysis Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-sm">{aiSummary}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Column Insights Tab */}
          <TabsContent value="insights" className="flex-1 overflow-auto p-6">
            <div className="space-y-6">
              {rawData.length > 0 ? (
                <>
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Column Insights</h3>
                    <Button 
                      onClick={generateKPIAnalysis}
                      disabled={loadingKPI || !rawData.length}
                      className="flex items-center gap-2"
                    >
                      <Activity className="h-4 w-4" />
                      {loadingKPI ? "Generating..." : "Next: Generate KPI Analysis"}
                    </Button>
                  </div>

                  {/* AI Summary */}
                  {aiSummary && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">AI Summary</CardTitle>
                        <CardDescription>
                          This is what we send to AI for analysis (first 5 rows)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-line text-sm">{aiSummary}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Column Analysis */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Column Analysis</CardTitle>
                      <CardDescription>
                        Detailed analysis of each column for chart generation
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {headers.map((header, index) => {
                          const columnData = rawData.map(row => row[header]).filter(val => 
                            val !== null && val !== undefined && val !== ''
                          );
                          const uniqueValues = [...new Set(columnData)];
                          const uniqueCount = uniqueValues.length;
                          
                          // Check if values are numeric
                          const numericValues = columnData.filter(val => 
                            typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))
                          );
                          const isNumeric = numericValues.length === columnData.length && columnData.length > 0;
                          
                          // Check if values are dates
                          const dateValues = columnData.filter(val => 
                            typeof val === 'string' && !isNaN(Date.parse(val))
                          );
                          const isDate = dateValues.length === columnData.length && columnData.length > 0;
                          
                          // Determine column type
                          let type = 'mixed';
                          let typeColor = 'bg-gray-100 text-gray-800';
                          let description = '';
                          
                          if (uniqueCount <= 10 && !isNumeric) {
                            type = 'categorical';
                            typeColor = 'bg-green-100 text-green-800';
                            description = 'Perfect for X-axis labels';
                          } else if (isNumeric && uniqueCount > 10) {
                            type = 'continuous';
                            typeColor = 'bg-blue-100 text-blue-800';
                            description = 'Good for Y-axis values';
                          } else if (uniqueCount > 10) {
                            type = 'many_values';
                            typeColor = 'bg-red-100 text-red-800';
                            description = 'Too many unique values - avoid for X-axis';
                          } else if (isDate) {
                            type = 'date';
                            typeColor = 'bg-purple-100 text-purple-800';
                            description = 'Good for time-series analysis';
                          }
                          
                          return (
                            <div key={index} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-medium">{header}</h4>
                                <Badge className={typeColor}>
                                  {type.toUpperCase()}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-600">Unique Values:</span>
                                  <span className="ml-2 font-medium">{uniqueCount}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Data Type:</span>
                                  <span className="ml-2 font-medium">
                                    {isNumeric ? 'Numeric' : isDate ? 'Date' : 'Text'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Total Values:</span>
                                  <span className="ml-2 font-medium">{columnData.length}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Usage:</span>
                                  <span className="ml-2 font-medium">{description}</span>
                                </div>
                              </div>
                              {uniqueCount <= 10 && !isNumeric && (
                                <div className="mt-2">
                                  <span className="text-gray-600 text-sm">Sample Values: </span>
                                  <span className="text-sm font-mono bg-gray-50 px-2 py-1 rounded">
                                    {uniqueValues.slice(0, 5).join(', ')}
                                    {uniqueValues.length > 5 && ` ... (+${uniqueValues.length - 5} more)`}
                                  </span>
                                </div>
                              )}
                              {isNumeric && uniqueCount > 10 && (
                                <div className="mt-2">
                                  <span className="text-gray-600 text-sm">Range: </span>
                                  <span className="text-sm font-mono bg-gray-50 px-2 py-1 rounded">
                                    {Math.min(...numericValues.map(v => Number(v)))} to {Math.max(...numericValues.map(v => Number(v)))}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Database className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Data Uploaded</h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      Upload a CSV file to view column insights and generate analysis
                    </p>
                    <Button onClick={() => setActiveTab("upload")}>
                      Go to Upload
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* KPI Analysis Tab */}
          <TabsContent value="kpi" className="flex-1 overflow-auto p-6">
            <div className="space-y-6">
              {kpiAnalysis ? (
                <>
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-2xl font-bold text-gray-900">KPI Dashboard</h3>
                      {fileDetails && (
                        <div className="flex items-center gap-2">
                          {fileDetails.connected_to_tableau ? (
                            <Button
                              onClick={() => router.push(`/dashboard/${fileDetails.folder_id}/${fileDetails.id}`)}
                              className="flex items-center gap-2"
                              variant="default"
                            >
                              <BarChart3 className="h-4 w-4" />
                              View in Tableau
                            </Button>
                          ) : (
                            <Button
                              onClick={() => router.push(`/dashboard/${fileDetails.folder_id}/${fileDetails.id}`)}
                              className="flex items-center gap-2"
                              variant="outline"
                            >
                              <BarChart3 className="h-4 w-4" />
                              Connect Tableau
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-gray-600 text-lg">{kpiAnalysis.summary}</p>
                  </div>
                  

                  {/* Charts Dashboard */}
                  <div className="space-y-8">
                    <h3 className="text-xl font-semibold text-gray-900 mb-6">Data Visualizations</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {kpiAnalysis.metrics.map((metric, index) => (
                        <KPIChart
                          key={`chart-${index}`}
                          title={metric.name}
                          description={metric.description}
                          chartType={metric.chartType as any}
                          data={rawData}
                          chartConfig={metric.chartConfig}
                          sqlQuery={metric.sqlQuery}
                          xAxisQuery={metric.xAxisQuery}
                          category={metric.category}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No KPI Analysis Yet</h3>
                    <p className="text-sm text-muted-foreground text-center mb-4">
                      Process your data and generate KPI analysis to see insights
                    </p>
                    <Button 
                      onClick={generateKPIAnalysis}
                      disabled={loadingKPI || !rawData.length}
                    >
                      {loadingKPI ? "Generating..." : "Generate Analysis"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
        )}
      </div>
    </div>
  )
}