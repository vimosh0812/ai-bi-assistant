"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Database, ChevronRight, ArrowLeft } from "lucide-react"
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

export function ChartView() {
  const router = useRouter()
  const [chartData, setChartData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showTableView, setShowTableView] = useState(false)

  useEffect(() => {
    const loadChartData = async () => {
      try {
        const storedData = sessionStorage.getItem('expandedChartData')
        if (storedData) {
          const parsed = JSON.parse(storedData)
          setChartData(parsed)
          setLoading(false)
        } else {
          // If no data in sessionStorage, redirect back
          router.back()
        }
      } catch (error) {
        console.error('Error loading chart data:', error)
        router.back()
      }
    }

    loadChartData()
  }, [router])

  if (loading || !chartData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading chart...</p>
        </div>
      </div>
    )
  }

  const { title, description, chartType, chartConfig, sqlQuery, xAxisQuery, category, tableData, chartData: finalChartData } = chartData

  const getChartOptions = () => ({
    responsive: true,
    maintainAspectRatio: chartType === 'pie' || chartType === 'donut' ? true : false,
    animation: chartType === 'pie' || chartType === 'donut' ? false : undefined,
    onClick: chartType === 'pie' || chartType === 'donut' ? (event: any, elements: any[]) => {
      event.stopPropagation()
    } : undefined,
    layout: chartType === 'pie' || chartType === 'donut' ? {
      padding: {
        top: 20,
        bottom: 20,
        left: 20,
        right: 20
      }
    } : undefined,
    plugins: {
      legend: {
        position: (chartType === 'pie' || chartType === 'donut') ? 'right' : 'top' as const,
        display: true,
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
        display: false,
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
            const label = context.dataset.label || ''
            const value = context.parsed.y || context.parsed
            return `${label}: ${typeof value === 'number' ? value.toLocaleString() : value}`
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
              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
              return value.toLocaleString()
            }
            return value
          }
        },
      },
    } : {},
  })

  const renderChart = () => {
    const chartOptions = getChartOptions()
    
    switch (chartType) {
      case 'bar':
        return <Bar data={finalChartData} options={chartOptions as any} />
      case 'line':
      case 'area':
        const lineOptions = {
          ...chartOptions,
          elements: {
            line: {
              tension: 0.4,
            },
            point: {
              radius: 4,
              hoverRadius: 6,
            },
          },
          scales: {
            ...chartOptions.scales,
            x: {
              ...chartOptions.scales?.x,
              type: 'category' as const,
            },
            y: {
              ...chartOptions.scales?.y,
              type: 'linear' as const,
            },
          },
        }
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
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {chartType.toUpperCase()}
          </Badge>
          {category && (
            <Badge variant="secondary" className="text-sm">
              {category}
            </Badge>
          )}
        </div>
      </div>

      {/* Chart View */}
      <Card className="w-full">
        <CardContent className="p-6">
          {/* View Toggle */}
          <div className="flex items-center justify-between mb-6">
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
            {showTableView && (
              <div className="text-xs text-muted-foreground">
                {tableData?.length || 0} rows of data
              </div>
            )}
          </div>

          {/* Chart or Table */}
          <div className="w-full" style={{ minHeight: '60vh' }}>
            {showTableView ? (
              <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                {tableData && tableData.length > 0 ? (
                  <div className="min-w-full">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {Object.keys(tableData[0]).map((key, index) => (
                            <th key={index} className="px-4 py-3 text-left font-medium text-gray-700 border-b border-gray-200">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.map((row: any, rowIndex: number) => (
                          <tr key={rowIndex} className="hover:bg-gray-50">
                            {Object.values(row).map((value: any, cellIndex: number) => (
                              <td key={cellIndex} className="px-4 py-3 border-b border-gray-200 text-gray-900">
                                {typeof value === 'number' ? value.toLocaleString() : String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    No data available
                  </div>
                )}
              </div>
            ) : (
              <div className={`w-full ${chartType === 'pie' || chartType === 'donut' ? 'flex items-center justify-center' : ''}`} style={{ minHeight: '60vh' }}>
                {chartType === 'pie' || chartType === 'donut' ? (
                  <div style={{ width: '60%', minWidth: '400px', maxWidth: '600px', aspectRatio: '1' }}>
                    {renderChart()}
                  </div>
                ) : (
                  <div style={{ height: '60vh' }}>
                    {renderChart()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SQL Queries */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Main SQL Query</h4>
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
            <div className="text-xs text-muted-foreground font-mono bg-gray-100 p-3 rounded overflow-x-auto max-h-32">
              <code>{sqlQuery}</code>
            </div>
            {xAxisQuery && (
              <>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">X-axis SQL Query</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(xAxisQuery)}
                    className="text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground font-mono bg-gray-100 p-3 rounded overflow-x-auto max-h-32">
                  <code>{xAxisQuery}</code>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

