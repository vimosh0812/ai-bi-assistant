"use client"

import React, { useState, useEffect } from "react"
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Database, ChevronLeft, ChevronRight, Trash2 } from "lucide-react"
import { DataTableComponent } from "@/components/data-table-component"
import { 
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js"

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend
)

interface KPIChartProps {
  title: string
  description: string
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'donut' | 'scatter'
  data: any[]
  chartConfig: {
    title: string
    xAxis?: string
    yAxis?: string
    groupBy?: string
    colors?: string[]
    dataLabels?: boolean
  }
  sqlQuery: string
  xAxisQuery?: string
  category?: string
  onDelete?: () => void
  showDeleteButton?: boolean
  kpiAnalysisId?: string
  metricIndex?: number
}

export function KPIChart({ 
  title, 
  description, 
  chartType, 
  data, 
  chartConfig, 
  sqlQuery,
  xAxisQuery,
  category,
  onDelete,
  showDeleteButton = false,
  kpiAnalysisId,
  metricIndex
}: KPIChartProps) {
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTableView, setShowTableView] = useState(false);
  const [dataSource, setDataSource] = useState<'stored' | 'live' | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);

  // Load chart data from stored execution results (primary method)
  useEffect(() => {
    const loadChartData = async () => {
      console.log('Loading chart data for:', { title, kpiAnalysisId, metricIndex, dataSource });
      
      // If we have stored results, we don't need the original data
      if (kpiAnalysisId && metricIndex !== undefined) {
        console.log(`🎯 Loading stored execution results for KPI ${metricIndex} (${title})`);
        
        const response = await fetch(`/api/get-kpi-execution-results?kpiAnalysisId=${kpiAnalysisId}&metricIndex=${metricIndex}`);
        const result = await response.json();
        
          if (result.success && result.results.length > 0) {
            const executionResult = result.results[0];
            console.log(`✅ Using stored execution results for ${title}`);
            console.log(`📊 Y-Axis Results:`, executionResult.y_axis_results?.slice(0, 3));
            console.log(`📊 X-Axis Results:`, executionResult.x_axis_results?.slice(0, 3));
            console.log(`📊 Execution Success:`, executionResult.execution_success);
            
            if (executionResult.execution_success && executionResult.y_axis_results && executionResult.y_axis_results.length > 0) {
              setChartData(generateChartDataFromSQL(executionResult.y_axis_results, executionResult.x_axis_results, chartConfig));
              setTableData(executionResult.y_axis_results || []);
              setDataSource('stored');
              setLoading(false);
              return;
            } else {
              console.warn(`⚠️ Stored execution failed or no data for ${title}, falling back to live execution`);
            }
          } else {
            console.log(`📭 No stored results found for ${title}, falling back to live execution`);
          }
      }
      
      // Fallback to live execution - check if we have data
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.log(`📭 No data available for ${title}`);
        setLoading(false);
        return;
      }
      
      console.log(`KPIChart loading data for: ${title}`);
      setLoading(true);
      setError(null);
      
      try {
        // Fallback to live execution
        console.log(`Executing SQL queries live for: ${title}`);
        
        // Get fileId from the data object
        const fileId = (data as any)?.fileId;
        
        if (!fileId) {
          // Fallback to unified method if no fileId available
          console.log("No fileId available, falling back to unified method");
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
          
          const yAxisData = await yAxisResponse.json();
          console.log("Y-axis SQL results (unified):", yAxisData.results);
          
          // Execute X-axis query for labels
          let xAxisData = null;
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
            
            xAxisData = await xAxisResponse.json();
          }
          
          // Process the results
          if (yAxisData.success) {
            setChartData(generateChartDataFromSQL(yAxisData.results, xAxisData?.results, chartConfig));
            setTableData(yAxisData.results || []);
            setDataSource('live');
          } else {
            setError(yAxisData.error || "Failed to execute SQL query");
          }
          return;
        }

        // Use temporary table method
        const yAxisResponse = await fetch("/api/execute-sql-temp-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sqlQuery, 
            fileId,
            xAxisQuery
          }),
        });
        
        const yAxisData = await yAxisResponse.json();
        console.log("Y-axis SQL results (temp table):", yAxisData.results);
        
        // Process the results
        if (yAxisData.success) {
          setChartData(generateChartDataFromSQL(yAxisData.results, yAxisData.xAxisResults, chartConfig));
          setTableData(yAxisData.results || []);
          setDataSource('live');
        } else {
          setError(yAxisData.error || "Failed to execute SQL query");
        }
        
      } catch (err) {
        console.error("Error loading chart data:", err);
        setError("Failed to load chart data");
        // Fallback to original data
        const fallbackData = generateChartDataFromOriginal();
        setChartData(fallbackData);
        // Set table data from original data if available
        if (data && Array.isArray(data) && data.length > 0) {
          setTableData(data);
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadChartData();
  }, [sqlQuery, xAxisQuery, data, chartConfig, kpiAnalysisId, metricIndex, title]);

  // Generate chart data from SQL execution results
  const generateChartDataFromSQL = (yAxisResults: any[], xAxisResults: any[] | null, config: any) => {
    if (!yAxisResults || yAxisResults.length === 0) {
      return null; // Return null to indicate no data
    }

    // Different color palettes for different chart types
    const pieColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    const blueishColors = [
      '#3B82F6', '#1D4ED8', '#2563EB', '#1E40AF', '#1E3A8A', 
      '#60A5FA', '#93C5FD', '#DBEAFE', '#BFDBFE', '#EFF6FF'
    ];
    
    const colors = config.colors || (chartType === 'pie' || chartType === 'donut' ? pieColors : blueishColors);
    
    // For Chart.js, we need to create an array of objects where each object represents a data point
    // Each object should have properties for the X-axis value and Y-axis value
    
    let chartData: any[] = [];
    
    if (xAxisResults && xAxisResults.length > 0) {
      // Use X-axis query results for labels and Y-axis results for values
      const minLength = Math.min(xAxisResults.length, yAxisResults.length);
      
      for (let i = 0; i < minLength; i++) {
        // Get the first column value from X-axis results (usually the label/category)
        const xValue = Object.values(xAxisResults[i])[0];
        
        // Get the first numeric value from Y-axis results (usually the metric value)
        const yValue = Object.values(yAxisResults[i]).find(val => 
          typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))
        );
        
        chartData.push({
          x: typeof xValue === 'string' ? xValue.substring(0, 20) : 
             typeof xValue === 'number' ? xValue.toString() : 
             `Item ${i + 1}`,
          y: yValue ? Number(yValue) : 0
        });
      }
    } else {
      // Generate data points from Y-axis results only
      // For Y-axis results, we need to extract both the label and value
      console.log("Processing Y-axis results without X-axis query");
      console.log("Sample Y-axis row:", yAxisResults[0]);
      
      yAxisResults.forEach((row, index) => {
        const rowEntries = Object.entries(row);
        
        console.log(`Processing row ${index}:`, row);
        console.log(`Row entries:`, rowEntries);
        
        // SIMPLIFIED APPROACH: Use column order and explicit logic
        let xValue = null;
        let yValue = null;
        
        // Strategy 1: Look for specific column names first
        for (const [key, value] of rowEntries) {
          const lowerKey = key.toLowerCase();
          console.log(`  Column: ${key} (${lowerKey}), Value: ${value} (${typeof value})`);
          
          if (lowerKey.includes('year') || lowerKey.includes('date') || lowerKey.includes('time')) {
            xValue = value;
            console.log(`    -> X-axis (name): ${value}`);
          } else if (lowerKey.includes('total') || lowerKey.includes('sum') || lowerKey.includes('count') || 
                     lowerKey.includes('avg') || lowerKey.includes('value') || lowerKey.includes('amount') ||
                     lowerKey.includes('units') || lowerKey.includes('sold') || lowerKey.includes('revenue')) {
            yValue = typeof value === 'number' ? value : (typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : null);
            console.log(`    -> Y-axis (name): ${yValue}`);
          }
        }
        
        // Strategy 2: If we don't have both, use simple column order
        if (xValue === null || yValue === null) {
          console.log(`  Using column order approach`);
          
          // Find the first non-numeric string or year-like number for X
          if (xValue === null) {
            for (const [key, value] of rowEntries) {
              if (typeof value === 'string' && isNaN(Number(value))) {
                xValue = value;
                console.log(`    -> X-axis (string): ${value}`);
                break;
              } else if (typeof value === 'number' && value >= 1900 && value <= 2100) {
                xValue = value;
                console.log(`    -> X-axis (year): ${value}`);
                break;
              } else if (typeof value === 'string' && !isNaN(Number(value))) {
                const numValue = Number(value);
                if (numValue >= 1900 && numValue <= 2100) {
                  xValue = numValue;
                  console.log(`    -> X-axis (year string): ${numValue}`);
                  break;
                }
              }
            }
          }
          
          // Find the first large number for Y (not a year)
          if (yValue === null) {
            for (const [key, value] of rowEntries) {
              if (typeof value === 'number' && (value < 1900 || value > 2100)) {
                yValue = value;
                console.log(`    -> Y-axis (number): ${value}`);
                break;
              } else if (typeof value === 'string' && !isNaN(Number(value))) {
                const numValue = Number(value);
                if (numValue < 1900 || numValue > 2100) {
                  yValue = numValue;
                  console.log(`    -> Y-axis (number string): ${numValue}`);
                  break;
                }
              }
            }
          }
        }
        
        // Strategy 3: Fallback to column order (first = X, second = Y)
        if (xValue === null || yValue === null) {
          console.log(`  Using fallback column order`);
          if (rowEntries.length >= 2) {
            if (xValue === null) {
              xValue = rowEntries[0][1];
              console.log(`    -> X-axis (first column): ${xValue}`);
            }
            if (yValue === null) {
              const secondValue = rowEntries[1][1];
              yValue = typeof secondValue === 'number' ? secondValue : 
                      (typeof secondValue === 'string' && !isNaN(Number(secondValue)) ? Number(secondValue) : secondValue);
              console.log(`    -> Y-axis (second column): ${yValue}`);
            }
          }
        }
        
        // Final validation: Ensure X and Y are different
        if (xValue !== null && yValue !== null && xValue === yValue) {
          console.log(`  ERROR: X and Y are the same (${xValue}), this should not happen!`);
          // Force different values - use index for X if they're the same
          xValue = `Item_${index + 1}`;
          console.log(`  Forced X to: ${xValue}`);
        }
        
        console.log(`  Final mapping - X: ${xValue}, Y: ${yValue}`);
        
        chartData.push({
          x: xValue ? String(xValue) : `Item_${index + 1}`,
          y: yValue ? Number(yValue) : 0
        });
      });
    }
    
    // console.log("SQL-generated chart data:", chartData);
    // console.log("Chart data structure - X values:", chartData.map(item => item.x));
    // console.log("Chart data structure - Y values:", chartData.map(item => item.y));
    // console.log("Chart data structure - Full objects:", chartData);
    
    // Use the standard Chart.js data structure for line charts
    const finalData = {
      labels: chartData.map(item => item.x), // X-axis labels (years)
      datasets: [
        {
          label: config.title || title,
          data: chartData.map(item => item.y), // Y-axis values (total_units_sold)
          backgroundColor: chartType === 'pie' || chartType === 'donut' ? 
            colors : 
            colors[0],
          borderColor: chartType === 'pie' || chartType === 'donut' ? 
            colors : 
            colors[0],
          borderWidth: 1,
          fill: chartType === 'area',
        },
      ],
    };
    
    // console.log("Final Chart.js data structure:", finalData);
    // console.log("Labels array:", finalData.labels);
    // console.log("Data points array:", finalData.datasets[0].data);
    // console.log("Sample data point:", finalData.datasets[0].data[0]);
    
    return finalData;
  };

  // Fallback to original data processing
  const generateChartDataFromOriginal = () => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      const blueishColors = [
        '#3B82F6', '#1D4ED8', '#2563EB', '#1E40AF', '#1E3A8A', 
        '#60A5FA', '#93C5FD', '#DBEAFE', '#BFDBFE', '#EFF6FF'
      ];
      return {
        labels: ['Sample 1', 'Sample 2', 'Sample 3', 'Sample 4', 'Sample 5'],
        datasets: [{
          label: chartConfig.title || title,
          data: [65, 59, 80, 81, 56],
          backgroundColor: blueishColors[0],
          borderColor: blueishColors[0],
          borderWidth: 1,
          fill: chartType === 'area',
        }],
      }
    }

    // Different color palettes for different chart types
    const pieColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    const blueishColors = [
      '#3B82F6', '#1D4ED8', '#2563EB', '#1E40AF', '#1E3A8A', 
      '#60A5FA', '#93C5FD', '#DBEAFE', '#BFDBFE', '#EFF6FF'
    ];
    
    const colors = chartConfig.colors || (chartType === 'pie' || chartType === 'donut' ? pieColors : blueishColors)
    
    // Simple fallback: use first 10 rows
    const safeData = Array.isArray(data) ? data : [];
    const labels = safeData.slice(0, 10).map((_, index) => `Item ${index + 1}`)
    const values = safeData.slice(0, 10).map((item, index) => {
      const numericValue = Object.values(item).find(val => 
        typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))
      )
      return numericValue ? Number(numericValue) : (index + 1) * 10
    })
    
    return {
      labels,
      datasets: [
        {
          label: chartConfig.title || title,
          data: values,
          backgroundColor: chartType === 'pie' || chartType === 'donut' ? 
            colors : 
            colors[0],
          borderColor: chartType === 'pie' || chartType === 'donut' ? 
            colors : 
            colors[0],
          borderWidth: 1,
          fill: chartType === 'area',
        },
      ],
    }
  }

  // Use SQL-generated data or fallback
  const finalChartData = chartData || generateChartDataFromOriginal()
  
  // Ensure table data is available
  const finalTableData = tableData.length > 0 ? tableData : (data && Array.isArray(data) ? data : [])
  
  // console.log("Final chart data for rendering:", finalChartData);

  // If no data available, don't render the chart
  if (!finalChartData) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <Database className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <p>No data available for this chart</p>
              <p className="text-sm text-gray-400 mt-1">SQL query returned no results</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        display: chartType !== 'pie' && chartType !== 'donut',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: '500' as const,
          },
        },
      },
      title: {
        display: true,
        text: chartConfig.title || title,
        font: {
          size: 18,
          weight: 'bold' as const,
        },
        color: '#374151',
        padding: 20,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: '#374151',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          label: function(context: any) {
            const label = context.dataset.label || '';
            const value = context.parsed.y || context.parsed;
            return `${label}: ${typeof value === 'number' ? value.toLocaleString() : value}`;
          }
        }
      },
    },
    scales: chartType !== 'pie' && chartType !== 'donut' ? {
      x: {
        display: true,
        title: {
          display: true,
          text: chartConfig.xAxis || 'X Axis',
          font: {
            size: 14,
            weight: '600' as const,
          },
          color: '#6B7280',
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: 11,
          },
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: chartConfig.yAxis || 'Y Axis',
          font: {
            size: 14,
            weight: '600' as const,
          },
          color: '#6B7280',
        },
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: 11,
          },
          callback: function(value: any) {
            if (typeof value === 'number') {
              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
              return value.toLocaleString();
            }
            return value;
          }
        },
      },
    } : {},
  }

  const renderChart = () => {
    if (loading) {
      return (
        <div className="h-64 flex items-center justify-center">
          <div className="w-full space-y-4">
            {/* Skeleton for chart title */}
            <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto"></div>
            
            {/* Skeleton for chart area */}
            <div className="h-48 bg-gray-100 rounded-lg flex items-end justify-center space-x-2 p-4">
              {/* Skeleton bars for bar chart */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div 
                  key={i} 
                  className="bg-gray-300 rounded-t"
                  style={{ 
                    height: `${Math.random() * 60 + 20}%`, 
                    width: '12%' 
                  }}
                ></div>
              ))}
            </div>
            
            {/* Skeleton for loading text */}
            <div className="text-center">
              <div className="h-3 bg-gray-200 rounded w-1/4 mx-auto"></div>
            </div>
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="h-64 flex items-center justify-center">
          <div className="text-sm text-red-500">Error: {error}</div>
        </div>
      )
    }

    switch (chartType) {
      case 'bar':
        return <Bar data={finalChartData} options={chartOptions as any} />
      case 'line':
      case 'area':
        console.log("Rendering line chart with data:", finalChartData);
        console.log("Chart options:", chartOptions);
        console.log("Labels for X-axis:", finalChartData.labels);
        console.log("Data for Y-axis:", finalChartData.datasets[0].data);
        
        const lineOptions = {
          ...chartOptions,
          elements: {
            line: {
              tension: 0.4, // Smooth curves
            },
            point: {
              radius: 4,
              hoverRadius: 6,
            },
          },
          plugins: {
            ...chartOptions.plugins,
            legend: {
              ...chartOptions.plugins?.legend,
              display: true,
            },
          },
          scales: {
            x: {
              type: 'category', // Explicitly set as category scale
              display: true,
              title: {
                display: true,
                text: 'Year',
                font: {
                  size: 14,
                  weight: '600' as const,
                },
                color: '#6B7280',
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.05)',
              },
              ticks: {
                color: '#6B7280',
                font: {
                  size: 11,
                },
              },
            },
            y: {
              type: 'linear', // Explicitly set as linear scale
              display: true,
              title: {
                display: true,
                text: 'Total Units Sold',
                font: {
                  size: 14,
                  weight: '600' as const,
                },
                color: '#6B7280',
              },
              beginAtZero: true,
              grid: {
                color: 'rgba(0, 0, 0, 0.05)',
              },
              ticks: {
                color: '#6B7280',
                font: {
                  size: 11,
                },
                callback: function(value: any) {
                  if (typeof value === 'number') {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                    return value.toLocaleString();
                  }
                  return value;
                }
              },
            },
          },
        };
        return <Line data={finalChartData} options={lineOptions as any} />
      case 'pie':
        return <Pie data={finalChartData} options={chartOptions as any} />
      case 'donut':
        return <Doughnut data={finalChartData} options={chartOptions as any} />
      default:
        return <Bar data={finalChartData} options={chartOptions as any} />
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{title}</CardTitle>
              {dataSource && (
                <span className={`px-2 py-1 text-xs rounded-full ${
                  dataSource === 'stored' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {dataSource === 'stored' ? '📊 Stored' : '⚡ Live'}
                </span>
              )}
            </div>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">
              {chartType.toUpperCase()}
            </Badge>
            {category && (
              <Badge variant="secondary" className="text-xs">
                {category}
              </Badge>
            )}
            {showDeleteButton && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                title="Delete this KPI metric"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* View Toggle - Show for all charts */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={!showTableView ? "default" : "outline"}
                size="sm"
                onClick={() => setShowTableView(false)}
                className="text-xs"
                disabled={loading}
              >
                <Database className="h-3 w-3 mr-1" />
                Chart
              </Button>
              <Button
                variant={showTableView ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  console.log('Table button clicked:', { 
                    showTableView, 
                    tableData: tableData.length, 
                    dataSource, 
                    loading 
                  });
                  setShowTableView(true);
                }}
                className="text-xs"
                disabled={loading}
              >
                <ChevronRight className="h-3 w-3 mr-1" />
                Table
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {loading ? (
                <div className="h-3 bg-gray-200 rounded w-32"></div>
              ) : showTableView ? (
                dataSource === 'stored' 
                  ? `${finalTableData.length} rows of execution results`
                  : `${finalTableData.length} rows of data`
              ) : (
                "Click Table to view data"
              )}
            </div>
          </div>

          {/* Chart or Table View */}
          <div className="h-64 w-full overflow-hidden">
            {showTableView ? (
              <div className="h-full overflow-x-auto">
                {/* Debug info */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="text-xs text-gray-500 mb-2">
                    Debug: dataSource={dataSource}, tableData.length={tableData.length}, loading={loading.toString()}
                  </div>
                )}
                {loading ? (
                  <div className="min-w-full">
                    {/* Skeleton table */}
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {Array.from({ length: 4 }).map((_, index) => (
                            <th key={index} className="px-3 py-2 text-left border-b">
                              <div className="h-4 bg-gray-200 rounded w-20"></div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 5 }).map((_, rowIndex) => (
                          <tr key={rowIndex}>
                            {Array.from({ length: 4 }).map((_, cellIndex) => (
                              <td key={cellIndex} className="px-3 py-2 border-b">
                                <div className="h-4 bg-gray-100 rounded w-16"></div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : finalTableData.length > 0 ? (
                  <div className="min-w-full">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(finalTableData[0]).map((key, index) => (
                            <th key={index} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {finalTableData.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-gray-50">
                            {Object.values(row).map((value, cellIndex) => (
                              <td key={cellIndex} className="px-3 py-2 border-b text-gray-900">
                                {typeof value === 'number' ? value.toLocaleString() : String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    No data available
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full">
                {renderChart()}
              </div>
            )}
          </div>
          
          {/* Main SQL Query */}
          {/* <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">SQL Query</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(sqlQuery)}
                className="text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <div className="text-xs text-muted-foreground font-mono bg-gray-100 p-3 rounded overflow-x-auto">
              <code>{sqlQuery}</code>
            </div>
          </div> */}
        </div>
      </CardContent>
    </Card>
  )
}
