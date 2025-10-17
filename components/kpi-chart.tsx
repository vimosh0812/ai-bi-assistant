"use client"

import React, { useState, useEffect } from "react"
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Database } from "lucide-react"
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
}

export function KPIChart({ 
  title, 
  description, 
  chartType, 
  data, 
  chartConfig, 
  sqlQuery,
  xAxisQuery,
  category 
}: KPIChartProps) {
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Execute SQL queries to get real data
  useEffect(() => {
    const executeQueries = async () => {
      if (!data || data.length === 0) return;
      
      console.log(`KPIChart executing SQL on ${data.length} rows of data`);
      setLoading(true);
      setError(null);
      
      try {
        // Execute main SQL query for Y-axis data
        const yAxisResponse = await fetch("/api/execute-sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sqlQuery, 
            data, 
            headers: Object.keys(data[0] || {})
          }),
        });
        
        const yAxisData = await yAxisResponse.json();
        
        // Execute X-axis query for labels
        let xAxisData = null;
        if (xAxisQuery) {
          const xAxisResponse = await fetch("/api/execute-sql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              sqlQuery: xAxisQuery, 
              data, 
              headers: Object.keys(data[0] || {})
            }),
          });
          
          xAxisData = await xAxisResponse.json();
        }
        
        // Generate chart data from SQL results
            const generatedData = generateChartDataFromSQL(yAxisData.results, xAxisData?.results, chartConfig);
            setChartData(generatedData);
            
            // If no data generated, set error state
            if (!generatedData) {
              setError("No data available for this chart");
            }
        
      } catch (err) {
        console.error("Error executing SQL queries:", err);
        setError("Failed to execute SQL queries");
        // Fallback to original data
        setChartData(generateChartDataFromOriginal());
      } finally {
        setLoading(false);
      }
    };
    
    executeQueries();
  }, [sqlQuery, xAxisQuery, data, chartConfig]);

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
    
    let labels: string[] = [];
    let values: number[] = [];
    
    if (xAxisResults && xAxisResults.length > 0) {
      // Use X-axis query results for labels
      labels = xAxisResults.map((row, index) => {
        const value = Object.values(row)[0];
        return typeof value === 'string' ? value.substring(0, 20) : 
               typeof value === 'number' ? value.toString() : 
               `Item ${index + 1}`;
      });
    } else {
      // Generate labels from Y-axis results
      labels = yAxisResults.map((_, index) => `Item ${index + 1}`);
    }
    
    // Extract values from Y-axis results
    values = yAxisResults.map(row => {
      // Try to find numeric values in the row
      const numericValue = Object.values(row).find(val => 
        typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))
      );
      
      return numericValue ? Number(numericValue) : 0;
    });
    
    console.log("SQL-generated labels:", labels);
    console.log("SQL-generated values:", values);
    
    return {
      labels: labels.slice(0, 10),
      datasets: [
        {
          label: config.title || title,
          data: values.slice(0, 10),
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
        return <Line data={finalChartData} options={chartOptions as any} />
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
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Chart */}
          <div className="h-64 w-full">
            {renderChart()}
          </div>
          
          {/* Main SQL Query */}
          {/* <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">SQL Query</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopyQuery(sqlQuery)}
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
