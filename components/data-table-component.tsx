"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Database, Loader2 } from "lucide-react";

interface DataTableComponentProps {
  sqlQuery: string;
  xAxisQuery?: string;
  data: any[];
  headers: string[];
}

export function DataTableComponent({
  sqlQuery,
  xAxisQuery,
  data,
  headers,
}: DataTableComponentProps) {
  const [tableData, setTableData] = useState<any[]>([]);
  const [xAxisData, setXAxisData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const executeQueries = async () => {
      if (!data || data.length === 0) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Execute main SQL query using unified method
        const yAxisResponse = await fetch("/api/execute-sql-unified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sqlQuery, 
            data, 
            headers: Object.keys(data[0] || {}),
            method: 'auto'
          }),
        });
        const yAxisResult = await yAxisResponse.json();
        
        if (yAxisResult.results) {
          setTableData(yAxisResult.results);
        }
        
        // Execute X-axis query if provided
        if (xAxisQuery) {
          const xAxisResponse = await fetch("/api/execute-sql-unified", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              sqlQuery: xAxisQuery, 
              data, 
              headers: Object.keys(data[0] || {}),
              method: 'auto'
            }),
          });
          const xAxisResult = await xAxisResponse.json();
          
          if (xAxisResult.results) {
            setXAxisData(xAxisResult.results);
          }
        }
        
      } catch (err) {
        console.error("Error executing SQL queries:", err);
        setError("Failed to execute SQL queries");
      } finally {
        setLoading(false);
      }
    };

    executeQueries();
  }, [sqlQuery, xAxisQuery, data]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log("SQL query copied to clipboard");
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-center py-4">
        {error}
      </div>
    );
  }

  if (tableData.length === 0) {
    return (
      <div className="text-gray-500 text-center py-4">
        No data available
      </div>
    );
  }

  // Get column names from the first row
  const columns = tableData.length > 0 ? Object.keys(tableData[0]) : [];

  return (
    <div className="space-y-4">
      {/* SQL Queries */}
      {/* <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="font-medium text-sm text-gray-700">SQL Queries</h5>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(sqlQuery)}
              className="text-xs"
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy Main Query
            </Button>
            {xAxisQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(xAxisQuery)}
                className="text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy X-Axis Query
              </Button>
            )}
          </div>
        </div>
        
        <div className="space-y-2">
          <div>
            <Badge variant="outline" className="mb-2">Main Query (Y-axis)</Badge>
            <div className="bg-gray-50 p-3 rounded-md border">
              <code className="text-xs text-gray-700 font-mono break-all">
                {sqlQuery}
              </code>
            </div>
          </div>
          
          {xAxisQuery && (
            <div>
              <Badge variant="outline" className="mb-2">X-axis Query</Badge>
              <div className="bg-gray-50 p-3 rounded-md border">
                <code className="text-xs text-gray-700 font-mono break-all">
                  {xAxisQuery}
                </code>
              </div>
            </div>
          )}
        </div>
      </div> */}

      {/* Data Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="font-medium text-sm text-gray-700">
            Query Results ({tableData.length} rows)
          </h5>
          {xAxisData.length > 0 && (
            <Badge variant="secondary">
              X-axis: {xAxisData.length} values
            </Badge>
          )}
        </div>
        
        <div className="max-h-96 overflow-auto border rounded-lg">
          <table className="min-w-full table-auto text-xs">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-2 py-1 text-left border font-medium whitespace-nowrap">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                  {columns.map((column) => (
                    <td key={column} className="px-2 py-1 border whitespace-nowrap">
                      {row[column] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* X-axis Data (if available) */}
      {/* {xAxisData.length > 0 && (
        <div className="space-y-3">
          <h5 className="font-medium text-sm text-gray-700">
            X-axis Values ({xAxisData.length} values)
          </h5>
          <div className="max-h-32 overflow-auto border rounded-lg">
            <table className="min-w-full table-auto text-xs">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  {Object.keys(xAxisData[0] || {}).map((column) => (
                    <th key={column} className="px-2 py-1 text-left border font-medium whitespace-nowrap">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {xAxisData.map((row, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                    {Object.keys(row).map((column) => (
                      <td key={column} className="px-2 py-1 border whitespace-nowrap">
                        {row[column] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )} */}
    </div>
  );
}
