"use client"

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ChartViewerProps {
  chartData: {
    config: {
      type: "bar" | "line" | "pie" | "area"
      title: string
      xAxis?: string
      yAxis?: string
      groupBy?: string
    }
    data: any[]
  }
}

// KPI Chart color palettes
const barColorOptions = ['#658e64', '#e29578', '#bf8d54', '#d462a5', '#8f3cfe', '#f2002b', '#613dc1'];
const lineColorOptions = ['#f5cb00', '#f6d220', '#f8d840', '#f9df60', '#fae580'];
const pieColorThemes = [
  ["#f18585","#f49c9c","#f6aeae","#f8cacf","#eed5fb","#e4bef8","#d5a8f2","#cb90f1","#c174f2"], 
  ["#f6bd60","#f7d5a1","#f7ede2","#f6dcd3","#f5cac3","#bdb8b0","#84a59d","#bb9590","#f28482"], 
  ["#0081a7","#0098b0","#00afb9","#7fd6cb","#fdfcdc","#feebca","#fed9b7","#f7a58f","#f07167"] 
];

// Get colors based on chart type
const getColors = (chartType: string) => {
  if (chartType === 'pie' || chartType === 'donut') {
    return pieColorThemes[0]; // Use first theme for pie charts
  } else if (chartType === 'line' || chartType === 'area') {
    return [lineColorOptions[0]]; // Use first line color
  } else {
    return [barColorOptions[0]]; // Use first bar color
  }
};

export function ChartViewer({ chartData }: ChartViewerProps) {
  const { config, data } = chartData

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">No data available for chart</p>
        </CardContent>
      </Card>
    )
  }

  const renderChart = () => {
    const colors = getColors(config.type);
    
    switch (config.type) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.xAxis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={config.yAxis || "value"} fill={colors[0]} />
            </BarChart>
          </ResponsiveContainer>
        )

      case "line":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.xAxis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={config.yAxis} stroke={colors[0]} />
            </LineChart>
          </ResponsiveContainer>
        )

      case "pie":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey={config.yAxis || "value"}
                nameKey={config.xAxis || "name"}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )

      case "area":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.xAxis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey={config.yAxis || "value"} stroke={colors[0]} fill={`${colors[0]}80`} />
            </AreaChart>
          </ResponsiveContainer>
        )

      default:
        return <p className="text-sm text-muted-foreground">Unsupported chart type</p>
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{config.title}</CardTitle>
      </CardHeader>
      <CardContent>{renderChart()}</CardContent>
    </Card>
  )
}
