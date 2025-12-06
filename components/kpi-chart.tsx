"use client"

import React, { useState, useEffect } from "react"
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Copy, Database, ChevronLeft, ChevronRight, Trash2, Palette, X } from "lucide-react"
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
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [individualColors, setIndividualColors] = useState<{[key: number]: string}>({});
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showIndividualColors, setShowIndividualColors] = useState(false);

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

  // Get current colors based on chart type and custom selection
  const getCurrentColors = () => {
    if (customColors.length > 0) {
      return customColors;
    }
    if (chartConfig.colors && chartConfig.colors.length > 0) {
      return chartConfig.colors;
    }
    const isPieChart = chartType === 'pie' || chartType === 'donut';
    return isPieChart ? colorPalettes.default.pie : colorPalettes.default.bar;
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
  }, [executionResults, chartConfig, customColors, individualColors]);

  // Generate chart data from SQL execution results
  const generateChartDataFromSQL = (yAxisResults: any[], xAxisResults: any[] | null, config: any) => {
    if (!yAxisResults || yAxisResults.length === 0) {
      return null; // Return null to indicate no data
    }

    const colors = getCurrentColors();
    
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
    
    // Get individual colors for the data points
    const individualColorsArray = getIndividualColors(chartData.length);
    
    // Use the standard Chart.js data structure for line charts
    const finalData = {
      labels: chartData.map(item => item.x), // X-axis labels (years)
      datasets: [
        {
          label: config.title || title,
          data: chartData.map(item => item.y), // Y-axis values (total_units_sold)
          backgroundColor: chartType === 'pie' || chartType === 'donut' ? 
            individualColorsArray : 
            individualColorsArray[0],
          borderColor: chartType === 'pie' || chartType === 'donut' ? 
            individualColorsArray : 
            individualColorsArray[0],
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
      const colors = getCurrentColors();
      return {
        labels: ['Sample 1', 'Sample 2', 'Sample 3', 'Sample 4', 'Sample 5'],
        datasets: [{
          label: chartConfig.title || title,
          data: [65, 59, 80, 81, 56],
          backgroundColor: colors[0],
          borderColor: colors[0],
          borderWidth: 1,
          fill: chartType === 'area',
        }],
      }
    }

    const colors = getCurrentColors();
    
    // Simple fallback: use first 10 rows
    const labels = data.slice(0, 10).map((_, index) => `Item ${index + 1}`)
    const values = data.slice(0, 10).map((item, index) => {
      const numericValue = Object.values(item).find(val => 
        typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))
      )
      return numericValue ? Number(numericValue) : (index + 1) * 10
    })
    
    // Get individual colors for the data points
    const individualColorsArray = getIndividualColors(values.length);
    
    return {
      labels,
      datasets: [
        {
          label: chartConfig.title || title,
          data: values,
          backgroundColor: chartType === 'pie' || chartType === 'donut' ? 
            individualColorsArray : 
            individualColorsArray[0],
          borderColor: chartType === 'pie' || chartType === 'donut' ? 
            individualColorsArray : 
            individualColorsArray[0],
          borderWidth: 1,
          fill: chartType === 'area',
        },
      ],
    }
  }

  // Use SQL-generated data or fallback
  const finalChartData = chartData || generateChartDataFromOriginal()
  
  // console.log("Final chart data for rendering:", finalChartData);

  // Color picker component
  const ColorPicker = () => {
    const isPieChart = chartType === 'pie' || chartType === 'donut';
    const currentPalette = isPieChart ? 'pie' : 'bar';
    
    console.log('ColorPicker rendering, showColorPicker:', showColorPicker);
    
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
                  {finalChartData && finalChartData.labels && finalChartData.labels.map((label: string, index: number) => (
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
                  ))}
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
        {/* Title and Action Buttons Row */}
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <ColorPicker />
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
        
        {/* Description Row */}
        <CardDescription className="mt-2">{description}</CardDescription>
        
        {/* Badges Row */}
        <div className="flex gap-2 mt-3">
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
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* View Toggle */}
          {/* <div className="flex items-center justify-between">
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
          </div> */}

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
