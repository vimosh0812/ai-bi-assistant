"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"
import { useCSVData } from "@/hooks/use-csv-data"
import type { File } from "@/types/database"
import { Skeleton } from "@/components/ui/skeleton"

interface CSVDataViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: File | null
}

export function CSVDataViewer({ open, onOpenChange, file }: CSVDataViewerProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const { csvData, loading, fetchData } = useCSVData(file?.table_name)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchData(page)
  }

  const exportToCSV = () => {
    if (!csvData || !file) return

    const headers = csvData.columns.join(",")
    const rows = csvData.data.map((row) => csvData.columns.map((col) => `"${row[col] || ""}"`).join(",")).join("\n")

    const csvContent = `${headers}\n${rows}`
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${file.name}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{file?.name}</span>
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={!csvData}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </DialogTitle>
          <DialogDescription>{file?.description || "CSV data viewer"}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : csvData ? (
            <>
              <div className="flex-1 overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {csvData.columns.map((column) => (
                        <TableHead key={column} className="font-medium">
                          {column.replace(/_/g, " ").toUpperCase()}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.data.map((row, index) => (
                      <TableRow key={index}>
                        {csvData.columns.map((column) => (
                          <TableCell key={column} className="max-w-xs truncate">
                            {row[column] || "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {csvData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * csvData.pagination.limit + 1} to{" "}
                    {Math.min(currentPage * csvData.pagination.limit, csvData.pagination.total)} of{" "}
                    {csvData.pagination.total} entries
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {csvData.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === csvData.pagination.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">No data available</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
