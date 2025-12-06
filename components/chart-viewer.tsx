"use client"

import React, { useState, useEffect } from "react"
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
import { Button } from "@/components/ui/button"
import { Palette, X } from "lucide-react"

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
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [individualColors, setIndividualColors] = useState<{[key: number]: string}>({});
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showIndividualColors, setShowIndividualColors] = useState(false);

  // Enhanced color palettes
  const colorPalettes = {
    default: {
      pie: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'],
      bar: ['#3B82F6', '#1D4ED8', '#2563EB', '#1E40AF', '#1E3A8A', '#60A5FA', '#93C5FD', '#DBEAFE', '#BFDBFE', '#EFF6FF']
    },
    vibrant: {
      pie: ['#FF4757', '#2ED573', '#1E90FF', '#FFA502', '#FF6348', '#9C88FF', '#FF6B9D', '#4ECDC4', '#45B7D1', '#96CEB4'],
      bar: ['#FF4757', '#2ED573', '#1E90FF', '#FFA502', '#FF6348', '#9C88FF', '#FF6B9D', '#4ECDC4', '#45B7D1', '#96CEB4']
    },
    pastel: {
      pie: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E6B3FF', '#FFB3E6', '#B3FFE6', '#FFE6B3', '#E6FFB3'],
      bar: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E6B3FF', '#FFB3E6', '#B3FFE6', '#FFE6B3', '#E6FFB3']
    },
    monochrome: {
      pie: ['#2D3748', '#4A5568', '#718096', '#A0AEC0', '#CBD5E0', '#E2E8F0', '#EDF2F7', '#F7FAFC', '#1A202C', '#2D3748'],
      bar: ['#2D3748', '#4A5568', '#718096', '#A0AEC0', '#CBD5E0', '#E2E8F0', '#EDF2F7', '#F7FAFC', '#1A202C', '#2D3748']
    },
    nature: {
      pie: ['#8FBC8F', '#228B22', '#32CD32', '#90EE90', '#98FB98', '#00FF7F', '#00FA9A', '#3CB371', '#2E8B57', '#006400'],
      bar: ['#8FBC8F', '#228B22', '#32CD32', '#90EE90', '#98FB98', '#00FF7F', '#00FA9A', '#3CB371', '#2E8B57', '#006400']
    },
    sunset: {
      pie: ['#FF7F50', '#FF6347', '#FF4500', '#FF8C00', '#FFA500', '#FFD700', '#FFFF00', '#FF69B4', '#FF1493', '#DC143C'],
      bar: ['#FF7F50', '#FF6347', '#FF4500', '#FF8C00', '#FFA500', '#FFD700', '#FFFF00', '#FF69B4', '#FF1493', '#DC143C']
    },
    ocean: {
      pie: ['#00CED1', '#20B2AA', '#48CAE4', '#0077BE', '#023E8A', '#03045E', '#0096C7', '#00B4D8', '#90E0EF', '#CAF0F8'],
      bar: ['#00CED1', '#20B2AA', '#48CAE4', '#0077BE', '#023E8A', '#03045E', '#0096C7', '#00B4D8', '#90E0EF', '#CAF0F8']
    },
    forest: {
      pie: ['#228B22', '#32CD32', '#90EE90', '#98FB98', '#00FF7F', '#00FA9A', '#3CB371', '#2E8B57', '#006400', '#8FBC8F'],
      bar: ['#228B22', '#32CD32', '#90EE90', '#98FB98', '#00FF7F', '#00FA9A', '#3CB371', '#2E8B57', '#006400', '#8FBC8F']
    },
    fire: {
      pie: ['#FF4500', '#FF6347', '#FF7F50', '#FF8C00', '#FFA500', '#FFD700', '#FFFF00', '#FF69B4', '#FF1493', '#DC143C'],
      bar: ['#FF4500', '#FF6347', '#FF7F50', '#FF8C00', '#FFA500', '#FFD700', '#FFFF00', '#FF69B4', '#FF1493', '#DC143C']
    },
    cool: {
      pie: ['#9370DB', '#8A2BE2', '#9400D3', '#8B008B', '#9932CC', '#BA55D3', '#DA70D6', '#EE82EE', '#DDA0DD', '#E6E6FA'],
      bar: ['#9370DB', '#8A2BE2', '#9400D3', '#8B008B', '#9932CC', '#BA55D3', '#DA70D6', '#EE82EE', '#DDA0DD', '#E6E6FA']
    },
    warm: {
      pie: ['#FFB6C1', '#FFA07A', '#FF7F50', '#FF6347', '#FF4500', '#FF8C00', '#FFA500', '#FFD700', '#FFFF00', '#FF69B4'],
      bar: ['#FFB6C1', '#FFA07A', '#FF7F50', '#FF6347', '#FF4500', '#FF8C00', '#FFA500', '#FFD700', '#FFFF00', '#FF69B4']
    }
  };

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showColorPicker) {
        const target = event.target as Element;
        if (!target.closest('[data-color-picker]')) {
          setShowColorPicker(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColorPicker]);

  // Get current colors based on chart type and custom selection
  const getCurrentColors = () => {
    if (customColors.length > 0) {
      return customColors;
    }
    return COLORS;
  };

  // Get individual colors for data points
  const getIndividualColors = (dataLength: number) => {
    const baseColors = getCurrentColors();
    const colors: string[] = [];
    
    for (let i = 0; i < dataLength; i++) {
      if (individualColors[i]) {
        colors.push(individualColors[i]);
      } else {
        colors.push(baseColors[i % baseColors.length]);
      }
    }
    
    return colors;
  };

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
                fill={colors[0]}
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

  // Color picker component
  const ColorPicker = () => {
    const isPieChart = config.type === 'pie';
    const currentPalette = isPieChart ? 'pie' : 'bar';
    
    return (
      <div className="relative" data-color-picker>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          title="Change chart colors"
          onClick={() => {
            console.log('Color picker button clicked');
            setShowColorPicker(!showColorPicker);
          }}
        >
          <Palette className="h-4 w-4" />
        </Button>
        
        {showColorPicker && (
          <div className="absolute right-0 top-10 z-50 w-96 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-h-96 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Chart Colors</h4>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowIndividualColors(!showIndividualColors)}
                    className="text-xs"
                  >
                    {showIndividualColors ? 'Palettes' : 'Individual'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCustomColors([]);
                      setIndividualColors({});
                      setShowColorPicker(false);
                    }}
                    className="h-6 w-6 p-0"
                    title="Reset to default"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              
              {!showIndividualColors ? (
                /* Color Palettes */
                <div className="space-y-3">
                  {Object.entries(colorPalettes).map(([paletteName, palette]) => (
                    <div key={paletteName} className="space-y-2">
                      <div className="text-xs font-medium capitalize text-gray-600">
                        {paletteName} Palette
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {palette[currentPalette].slice(0, 8).map((color, index) => (
                          <button
                            key={index}
                            className="w-6 h-6 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              setCustomColors(palette[currentPalette]);
                              setShowColorPicker(false);
                            }}
                            title={`Apply ${paletteName} palette`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Individual Color Selection */
                <div className="space-y-3">
                  <div className="text-xs font-medium text-gray-600">
                    Individual Data Point Colors
                  </div>
                  {data && data.map((item, index) => {
                    const label = item[config.xAxis || 'name'] || `Item ${index + 1}`;
                    return (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: individualColors[index] || getCurrentColors()[index % getCurrentColors().length] }}
                          />
                          <span className="text-xs text-gray-700 truncate max-w-32">
                            {String(label).substring(0, 20)}
                          </span>
                        </div>
                        <input
                          type="color"
                          value={individualColors[index] || getCurrentColors()[index % getCurrentColors().length]}
                          onChange={(e) => {
                            setIndividualColors(prev => ({
                              ...prev,
                              [index]: e.target.value
                            }));
                          }}
                          className="w-8 h-6 rounded border border-gray-300 cursor-pointer"
                          title={`Color for ${label}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Custom Color Input - Only show in palette mode */}
              {!showIndividualColors && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-600">Custom Colors</div>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={customColors[0] || '#3B82F6'}
                      onChange={(e) => {
                        const newColors = [...customColors];
                        newColors[0] = e.target.value;
                        setCustomColors(newColors);
                      }}
                      className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                      title="Primary color"
                    />
                    <input
                      type="color"
                      value={customColors[1] || '#1D4ED8'}
                      onChange={(e) => {
                        const newColors = [...customColors];
                        newColors[1] = e.target.value;
                        setCustomColors(newColors);
                      }}
                      className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                      title="Secondary color"
                    />
                    <input
                      type="color"
                      value={customColors[2] || '#2563EB'}
                      onChange={(e) => {
                        const newColors = [...customColors];
                        newColors[2] = e.target.value;
                        setCustomColors(newColors);
                      }}
                      className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                      title="Tertiary color"
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    {isPieChart ? 'Colors will be used for pie slices' : 'Colors will be used for bars/lines'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{config.title}</CardTitle>
          <ColorPicker />
        </div>
      </CardHeader>
      <CardContent>{renderChart()}</CardContent>
    </Card>
  )
}
