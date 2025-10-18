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
  fileId?: string
  userId?: string
  executionResults?: {
    yAxisData: any[]
    xAxisData?: any[]
    executionTime: number
    executionMethod: string
    cached: boolean
    lastExecuted: string
    error?: string
  }
  onDelete?: () => void
  showDeleteButton?: boolean
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
  fileId,
  userId,
  executionResults,
  onDelete,
  showDeleteButton = false
}: KPIChartProps) {
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTableView, setShowTableView] = useState(false);

  // Use stored execution results from JSONB only
  useEffect(() => {
    const processData = async () => {
      if (!data || data.length === 0) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Check if we have stored execution results in JSONB
        if (executionResults?.yAxisData !== undefined && executionResults?.lastExecuted) {
          console.log(`✅ Using cached execution results for ${title} (executed: ${executionResults.lastExecuted}) - No SQL delay!`);
          
          // Check if there was an execution error
          if (executionResults.error) {
            console.log(`Execution error for ${title}:`, executionResults.error);
            setError(`SQL execution failed: ${executionResults.error}`);
            return;
          }
          
          // Use stored data directly - no SQL execution needed
          const yAxisResults = executionResults.yAxisData;
          const xAxisResults = executionResults.xAxisData || [];
          
          // Handle empty results (valid case - SQL returned no data)
          if (yAxisResults.length === 0) {
            console.log(`Cached SQL execution returned empty results for ${title} - this is valid`);
            setError("No data available for this chart - SQL query returned no results");
            return;
          }
          
          // Generate chart data from stored results
          const generatedData = generateChartDataFromSQL(yAxisResults, xAxisResults, chartConfig);
          setChartData(generatedData);
          
          if (!generatedData) {
            setError("No data available for this chart");
          }
        } else {
          console.log(`No cached execution results for ${title} - using fallback data processing`);
          // Use fallback data processing instead of showing error
          const generatedData = generateChartDataFromOriginal();
          setChartData(generatedData);
          
          if (!generatedData) {
            setError("No data available for this chart");
          }
        }
        
      } catch (err) {
        console.error("Error processing chart data:", err);
        setError("Failed to process chart data");
        // Fallback to original data
        setChartData(generateChartDataFromOriginal());
      } finally {
        setLoading(false);
      }
    };
    
    processData();
  }, [executionResults, chartConfig]);

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
    if (!data || data.length === 0) {
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
    const labels = data.slice(0, 10).map((_, index) => `Item ${index + 1}`)
    const values = data.slice(0, 10).map((item, index) => {
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
          <div className="text-sm text-muted-foreground">Loading chart data...</div>
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
            <CardTitle className="text-lg">{title}</CardTitle>
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
            {executionResults?.cached && (
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                📦 Cached
              </Badge>
            )}
            {executionResults?.lastExecuted && !executionResults?.cached && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                ⚡ Pre-loaded
              </Badge>
            )}
            {executionResults?.lastExecuted && (
              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">
                🚀 Instant Load ({executionResults.executionTime}ms)
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
          {/* View Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={!showTableView ? "default" : "outline"}
                size="sm"
                onClick={() => setShowTableView(false)}
                className="text-xs"
              >
                <Database className="h-3 w-3 mr-1" />
                Chart
              </Button>
              <Button
                variant={showTableView ? "default" : "outline"}
                size="sm"
                onClick={() => setShowTableView(true)}
                className="text-xs"
              >
                <ChevronRight className="h-3 w-3 mr-1" />
                Table
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {showTableView ? "Scroll horizontally to view data" : "Click Table to view data"}
            </div>
          </div>

          {/* Chart or Table View */}
          <div className="h-64 w-full overflow-hidden">
            {showTableView ? (
              <div className="h-full overflow-x-auto">
                <DataTableComponent
                  sqlQuery={sqlQuery}
                  xAxisQuery={xAxisQuery}
                  data={data}
                  headers={data.length > 0 ? Object.keys(data[0]) : []}
                  fileId={fileId}
                  userId={userId}
                />
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
