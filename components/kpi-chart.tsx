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
  const [actualChartType, setActualChartType] = useState<'bar' | 'line' | 'pie' | 'area' | 'donut' | 'scatter'>(chartType);

  // Update actualChartType when chartType prop changes
  useEffect(() => {
    setActualChartType(chartType);
  }, [chartType]);

  // Load chart data from stored execution results (primary method)
  useEffect(() => {
    const loadChartData = async () => {
      console.log('📊 [CHART LOAD] Loading chart data for:', { title, kpiAnalysisId, metricIndex, dataSource });
      
      // If we have stored results, we don't need the original data
      if (kpiAnalysisId && metricIndex !== undefined) {
        console.log('📊 [CHART LOAD] Fetching stored execution results...', {
          kpiAnalysisId,
          metricIndex,
          url: `/api/get-kpi-execution-results?kpiAnalysisId=${kpiAnalysisId}&metricIndex=${metricIndex}`
        });
        
        const response = await fetch(`/api/get-kpi-execution-results?kpiAnalysisId=${kpiAnalysisId}&metricIndex=${metricIndex}`);
        const result = await response.json();
        
        console.log('📊 [CHART LOAD] Execution results response:', {
          success: result.success,
          resultsCount: result.results?.length || 0,
          fullResponse: result
        });
        
          if (result.success && result.results.length > 0) {
            const executionResult = result.results[0];
            
            console.log('📊 [CHART LOAD] Execution result details:', {
              executionSuccess: executionResult.execution_success,
              yAxisResultsCount: executionResult.y_axis_results?.length || 0,
              xAxisResultsCount: executionResult.x_axis_results?.length || 0,
              metricName: executionResult.metric_name,
              sqlQuery: executionResult.sql_query,
              xAxisQuery: executionResult.x_axis_query,
              sampleYAxis: executionResult.y_axis_results?.slice(0, 2),
              sampleXAxis: executionResult.x_axis_results?.slice(0, 2)
            });
            
            if (executionResult.execution_success && executionResult.y_axis_results && executionResult.y_axis_results.length > 0) {
              console.log('✅ [CHART LOAD] Using stored execution results for chart');
              setChartData(generateChartDataFromSQL(executionResult.y_axis_results, executionResult.x_axis_results, chartConfig));
              setTableData(executionResult.y_axis_results || []);
              setDataSource('stored');
              return;
            } else {
              console.warn('⚠️ [CHART LOAD] Stored execution result is not valid:', {
                executionSuccess: executionResult.execution_success,
                hasYAxisResults: !!executionResult.y_axis_results,
                yAxisResultsLength: executionResult.y_axis_results?.length || 0
              });
            }
          } else {
            console.warn('⚠️ [CHART LOAD] No stored execution results found, falling back to live execution');
          }
      }
      
      // Fallback to live execution - check if we have data
      if (!data || !Array.isArray(data) || data.length === 0) {
        return;
      }
      
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
        setChartData(null);
        if (data && Array.isArray(data) && data.length > 0) {
          setTableData(data);
        }
      }
    };
    
    loadChartData();
  }, [sqlQuery, xAxisQuery, data, chartConfig, kpiAnalysisId, metricIndex, title]);

  // Generate chart data from SQL execution results
  const generateChartDataFromSQL = (yAxisResults: any[], xAxisResults: any[] | null, config: any) => {
    if (!yAxisResults || yAxisResults.length === 0) {
      return null; // Return null to indicate no data
    }

    // Enforce rule: Line charts require >= 3 X-axis values, otherwise use bar chart
    if ((chartType === 'line' || chartType === 'area') && yAxisResults.length < 3) {
      console.log(`⚠️ Converting ${chartType} chart to bar chart: Only ${yAxisResults.length} X-axis values (requires >= 3)`);
      setActualChartType('bar');
    } 
    // Enforce rule: Pie/Donut charts require <= 15 values, otherwise use bar chart
    else if ((chartType === 'pie' || chartType === 'donut') && yAxisResults.length > 15) {
      console.log(`⚠️ Converting ${chartType} chart to bar chart: ${yAxisResults.length} values (pie/donut charts require ≤15 values)`);
      setActualChartType('bar');
    } else {
      setActualChartType(chartType);
    }

    // Different color palettes for different chart types
    // Color palette for bar charts - choose random color
    const barColorOptions = ['#658e64', '#e29578', '#bf8d54', '#d462a5', '#8f3cfe', '#f2002b', '#613dc1'];
    // Color palette for line charts - choose random color
    const lineColorOptions = ['#f5cb00', '#f6d220', '#f8d840', '#f9df60', '#fae580'];
    // Color palette themes for pie and donut charts - use metricIndex to assign different themes
    const pieColorThemes = [
      ["#f18585","#f49c9c","#f6aeae","#f8cacf","#eed5fb","#e4bef8","#d5a8f2","#cb90f1","#c174f2"], 
      ["#f6bd60","#f7d5a1","#f7ede2","#f6dcd3","#f5cac3","#bdb8b0","#84a59d","#bb9590","#f28482"], 
      ["#0081a7","#0098b0","#00afb9","#7fd6cb","#fdfcdc","#feebca","#fed9b7","#f7a58f","#f07167"] 
    ];
    // Use metricIndex to cycle through themes for different pie charts, fallback to random if no index
    const themeIndex = metricIndex !== undefined 
      ? metricIndex % pieColorThemes.length 
      : Math.floor(Math.random() * pieColorThemes.length);
    const pieColors = pieColorThemes[themeIndex];
    
    // Use different colors based on chart type
    let colors;
    if (chartType === 'pie' || chartType === 'donut') {
      colors = config.colors || pieColors;
    } else if (chartType === 'line' || chartType === 'area') {
      // Choose random color from line color options
      const randomLineColor = lineColorOptions[Math.floor(Math.random() * lineColorOptions.length)];
      colors = config.colors || [randomLineColor];
    } else {
      // Choose random color from bar color options
      const randomBarColor = barColorOptions[Math.floor(Math.random() * barColorOptions.length)];
      colors = config.colors || [randomBarColor];
    }
    
    // For Chart.js, we need to create an array of objects where each object represents a data point
    // Each object should have properties for the X-axis value and Y-axis value
    
    let chartData: any[] = [];
    
    // Helper function to parse numeric values (handles comma-separated numbers)
    const parseNumericValue = (value: any): number | null => {
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        // Remove commas and parse
        const cleaned = value.replace(/,/g, '').trim();
        const num = Number(cleaned);
        return !isNaN(num) ? num : null;
      }
      return null;
    };
    
    if (xAxisResults && xAxisResults.length > 0) {
      // Use X-axis query results for labels and Y-axis results for values
      const minLength = Math.min(xAxisResults.length, yAxisResults.length);
      
      for (let i = 0; i < minLength; i++) {
        // Get the first column value from X-axis results (usually the label/category)
        const xValue = Object.values(xAxisResults[i])[0];
        
        // Get Y value from Y-axis results - look for non-year numeric values
        let yValue = null;
        const yRow = yAxisResults[i];
        const yEntries = Object.entries(yRow);
        
        // Try to find Y using config first
        if (config.yAxis) {
          const yAxisKey = yEntries.find(([key]) => 
            key.toLowerCase() === config.yAxis.toLowerCase() || 
            key.toLowerCase().replace(/[^a-z0-9]/g, '_') === config.yAxis.toLowerCase()
          );
          if (yAxisKey) {
            const parsed = parseNumericValue(yAxisKey[1]);
            if (parsed !== null) {
              yValue = parsed;
            }
          }
        }
        
        // If not found, look for aggregate/metric columns
        if (yValue === null) {
          for (const [key, value] of yEntries) {
            const lowerKey = key.toLowerCase();
            const parsed = parseNumericValue(value);
            
            // Skip year-like values
            if (parsed !== null && parsed >= 1900 && parsed <= 2100) {
              continue;
            }
            
            // Look for metric columns
            if (parsed !== null && parsed > 0 && (
              lowerKey.includes('total') || lowerKey.includes('sum') || lowerKey.includes('count') || 
              lowerKey.includes('avg') || lowerKey.includes('value') || lowerKey.includes('amount') ||
              lowerKey.includes('quantity') || lowerKey.includes('units') || lowerKey.includes('sold') ||
              lowerKey.includes('revenue') || lowerKey.includes('clicks') || lowerKey.includes('orders')
            )) {
              yValue = parsed;
              break;
            }
          }
        }
        
        // Fallback: use first non-year numeric value
        if (yValue === null) {
          for (const [key, value] of yEntries) {
            const parsed = parseNumericValue(value);
            if (parsed !== null && parsed > 0 && (parsed < 1900 || parsed > 2100)) {
              yValue = parsed;
              break;
            }
          }
        }
        
        // Final fallback: use second column value if available
        if (yValue === null && yEntries.length > 1) {
          const parsed = parseNumericValue(yEntries[1][1]);
          if (parsed !== null) {
            yValue = parsed;
          }
        }
        
        chartData.push({
          x: typeof xValue === 'string' ? xValue.replace(/,/g, '').substring(0, 20) : 
             typeof xValue === 'number' ? xValue.toString() : 
             `Item ${i + 1}`,
          y: yValue !== null ? yValue : 0
        });
      }
    } else {
      // Generate data points from Y-axis results only
      // For Y-axis results, we need to extract both the label and value
      console.log("Processing Y-axis results without X-axis query");
      console.log("Sample Y-axis row:", yAxisResults[0]);
      
      // Helper function to parse numeric values (handles comma-separated numbers)
      const parseNumericValue = (value: any): number | null => {
        if (typeof value === 'number') {
          return value;
        }
        if (typeof value === 'string') {
          // Remove commas and parse
          const cleaned = value.replace(/,/g, '').trim();
          const num = Number(cleaned);
          return !isNaN(num) ? num : null;
        }
        return null;
      };
      
      // Helper function to check if a value looks like a year
      const isYearValue = (value: any): boolean => {
        const num = parseNumericValue(value);
        return num !== null && num >= 1900 && num <= 2100;
      };
      
      yAxisResults.forEach((row, index) => {
        const rowEntries = Object.entries(row);
        
        console.log(`Processing row ${index}:`, row);
        console.log(`Row entries:`, rowEntries);
        
        let xValue = null;
        let yValue = null;
        let xColumn = null;
        let yColumn = null;
        
        // Strategy 1: Use chartConfig to identify columns if available
        if (config.xAxis && config.yAxis) {
          const xAxisKey = rowEntries.find(([key]) => 
            key.toLowerCase() === config.xAxis.toLowerCase() || 
            key.toLowerCase().replace(/[^a-z0-9]/g, '_') === config.xAxis.toLowerCase()
          );
          const yAxisKey = rowEntries.find(([key]) => 
            key.toLowerCase() === config.yAxis.toLowerCase() || 
            key.toLowerCase().replace(/[^a-z0-9]/g, '_') === config.yAxis.toLowerCase()
          );
          
          if (xAxisKey) {
            xValue = xAxisKey[1];
            xColumn = xAxisKey[0];
            console.log(`    -> X-axis (from config): ${xColumn} = ${xValue}`);
          }
          if (yAxisKey) {
            const parsed = parseNumericValue(yAxisKey[1]);
            if (parsed !== null) {
              yValue = parsed;
              yColumn = yAxisKey[0];
              console.log(`    -> Y-axis (from config): ${yColumn} = ${yValue}`);
            }
          }
        }
        
        // Strategy 2: Look for specific column names (only if not found from config)
        if (xValue === null || yValue === null) {
        for (const [key, value] of rowEntries) {
          const lowerKey = key.toLowerCase();
          
            // Identify X-axis: time-related columns
            if (xValue === null && (lowerKey.includes('year') || lowerKey.includes('date') || 
                lowerKey.includes('time') || lowerKey.includes('month') || lowerKey.includes('quarter'))) {
            xValue = value;
              xColumn = key;
              console.log(`    -> X-axis (name match): ${key} = ${value}`);
            }
            
            // Identify Y-axis: metric/aggregate columns (but NOT year-like values)
            if (yValue === null && !isYearValue(value)) {
              if (lowerKey.includes('total') || lowerKey.includes('sum') || lowerKey.includes('count') || 
                  lowerKey.includes('avg') || lowerKey.includes('average') || lowerKey.includes('value') || 
                  lowerKey.includes('amount') || lowerKey.includes('quantity') || lowerKey.includes('units') || 
                  lowerKey.includes('sold') || lowerKey.includes('revenue') || lowerKey.includes('sales') ||
                  lowerKey.includes('clicks') || lowerKey.includes('orders') || lowerKey.includes('leads')) {
                const parsed = parseNumericValue(value);
                if (parsed !== null && parsed > 0) {
                  yValue = parsed;
                  yColumn = key;
                  console.log(`    -> Y-axis (name match): ${key} = ${yValue}`);
                }
              }
            }
          }
        }
        
        // Strategy 3: Use column order and value characteristics
        if (xValue === null || yValue === null) {
          // Find X: year-like values or first column
          if (xValue === null) {
            for (const [key, value] of rowEntries) {
              if (isYearValue(value)) {
                xValue = value;
                xColumn = key;
                console.log(`    -> X-axis (year detection): ${key} = ${xValue}`);
                  break;
                }
              }
            // If still not found, use first column
            if (xValue === null && rowEntries.length > 0) {
              xValue = rowEntries[0][1];
              xColumn = rowEntries[0][0];
              console.log(`    -> X-axis (first column): ${xColumn} = ${xValue}`);
            }
          }
          
          // Find Y: large numeric values (not years)
          if (yValue === null) {
            for (const [key, value] of rowEntries) {
              const parsed = parseNumericValue(value);
              if (parsed !== null && !isYearValue(value) && parsed > 0) {
                yValue = parsed;
                yColumn = key;
                console.log(`    -> Y-axis (numeric detection): ${key} = ${yValue}`);
                  break;
                }
            }
            // If still not found, use second column
            if (yValue === null && rowEntries.length > 1) {
              const parsed = parseNumericValue(rowEntries[1][1]);
              if (parsed !== null) {
                yValue = parsed;
                yColumn = rowEntries[1][0];
                console.log(`    -> Y-axis (second column): ${yColumn} = ${yValue}`);
              }
            }
          }
        }
        
        // Final validation: Ensure X and Y are different and valid
        if (xValue !== null && yValue !== null) {
          const xNum = parseNumericValue(xValue);
          const yNum = yValue;
          
          // If X and Y are the same numeric value, there's an error
          if (xNum !== null && xNum === yNum && isYearValue(xValue)) {
            console.error(`  ERROR: X and Y are the same (${xValue}), trying to fix...`);
            // Try to find a different Y value
            for (const [key, value] of rowEntries) {
              if (key !== xColumn) {
                const parsed = parseNumericValue(value);
                if (parsed !== null && !isYearValue(value) && parsed > 0) {
                  yValue = parsed;
                  yColumn = key;
                  console.log(`    -> Fixed Y-axis: ${yColumn} = ${yValue}`);
                  break;
                }
              }
            }
          }
        }
        
        console.log(`  Final mapping - X: ${xColumn} = ${xValue}, Y: ${yColumn} = ${yValue}`);
        
        // Format X value (remove commas, keep as string for display)
        const xDisplay = xValue !== null ? String(xValue).replace(/,/g, '') : `Item_${index + 1}`;
        const yDisplay = yValue !== null ? yValue : 0;
        
        chartData.push({
          x: xDisplay,
          y: yDisplay
        });
      });
    }
    
    // console.log("SQL-generated chart data:", chartData);
    // console.log("Chart data structure - X values:", chartData.map(item => item.x));
    // console.log("Chart data structure - Y values:", chartData.map(item => item.y));
    // console.log("Chart data structure - Full objects:", chartData);
    
    // Use the standard Chart.js data structure for line charts
    // For line/area charts, use the first OLAP color; for bar charts, cycle through colors
    // Use actualChartType instead of chartType to respect the validation rule
    const effectiveChartType = actualChartType;
    const datasetColor = effectiveChartType === 'line' || effectiveChartType === 'area' 
      ? colors[0] 
      : (effectiveChartType === 'pie' || effectiveChartType === 'donut' ? colors : colors[0]);
    
    const finalData = {
      labels: chartData.map(item => {
        // Format quarter labels if they exist
        const label = String(item.x);
        if (label.match(/^\d+\s*Q[1-4]$/i)) {
          return label; // Already formatted as "2021 Q1"
        }
        return label;
      }), // X-axis labels (years, quarters, months, etc.)
      datasets: [
        {
          label: config.title || title,
          data: chartData.map(item => item.y), // Y-axis values
          backgroundColor: effectiveChartType === 'pie' || effectiveChartType === 'donut' ? 
            colors : 
            (effectiveChartType === 'area' ? `${datasetColor}80` : datasetColor), // Add transparency for area charts
          borderColor: datasetColor,
          borderWidth: effectiveChartType === 'line' || effectiveChartType === 'area' ? 2 : 1,
          fill: effectiveChartType === 'area',
          pointRadius: effectiveChartType === 'line' || effectiveChartType === 'area' ? 4 : 0,
          pointHoverRadius: effectiveChartType === 'line' || effectiveChartType === 'area' ? 6 : 0,
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
    // Color palette for bar charts - choose random color
    const barColorOptions = ['#658e64', '#e29578', '#bf8d54', '#d462a5', '#8f3cfe', '#f2002b', '#613dc1'];
    // Color palette for line charts - choose random color
    const lineColorOptions = ['#f5cb00', '#f6d220', '#f8d840', '#f9df60', '#fae580'];
    // Color palette themes for pie and donut charts - use metricIndex to assign different themes
    const pieColorThemes = [
      ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#ade8f4', '#caf0f8'], // Blue theme (original)
      ['#916d47', '#9f784e', '#af8456', '#c0915f', '#d39f69', '#e8af73', '#ffc07f', '#ffc88c', '#ffcf99'], // Brown/beige theme
      ['#590d22', '#800f2f', '#a4133c', '#c9184a', '#ff4d6d', '#ff758f', '#ff8fa3', '#ffb3c1', '#ffccd5']  // Red/pink theme
    ];
    // Use metricIndex to cycle through themes for different pie charts, fallback to random if no index
    const themeIndex = metricIndex !== undefined 
      ? metricIndex % pieColorThemes.length 
      : Math.floor(Math.random() * pieColorThemes.length);
    const pieColors = pieColorThemes[themeIndex];
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      // Return null to show skeleton loading instead of dummy data
      return null;
    }

    // Use different colors based on chart type
    let colors;
    if (chartType === 'pie' || chartType === 'donut') {
      colors = chartConfig.colors || pieColors;
    } else if (chartType === 'line' || chartType === 'area') {
      // Choose random color from line color options
      const randomLineColor = lineColorOptions[Math.floor(Math.random() * lineColorOptions.length)];
      colors = chartConfig.colors || [randomLineColor];
    } else {
      // Choose random color from bar color options
      const randomBarColor = barColorOptions[Math.floor(Math.random() * barColorOptions.length)];
      colors = chartConfig.colors || [randomBarColor];
    }
    
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
            (chartType === 'area' ? `${colors[0]}80` : colors[0]),
          borderColor: colors[0],
          borderWidth: chartType === 'line' || chartType === 'area' ? 2 : 1,
          fill: chartType === 'area',
          pointRadius: chartType === 'line' || chartType === 'area' ? 4 : 0,
          pointHoverRadius: chartType === 'line' || chartType === 'area' ? 6 : 0,
        },
      ],
    }
  }

  // Use SQL-generated data or fallback
  const finalChartData = chartData || generateChartDataFromOriginal()
  
  // Ensure table data is available
  const finalTableData = tableData.length > 0 ? tableData : (data && Array.isArray(data) ? data : [])
  
  // Final validation: Enforce chart type rules based on actual data
  let displayChartType = actualChartType;
  if (finalChartData && finalChartData.labels) {
    const uniqueLabels = finalChartData.labels.length;
    if ((actualChartType === 'line' || actualChartType === 'area') && uniqueLabels < 3) {
      console.log(`⚠️ Final validation: Converting ${actualChartType} to bar chart (${uniqueLabels} < 3 labels)`);
      displayChartType = 'bar';
    }
    // Enforce pie/donut chart rule: must have ≤15 values
    if ((actualChartType === 'pie' || actualChartType === 'donut') && uniqueLabels > 15) {
      console.log(`⚠️ Final validation: Converting ${actualChartType} to bar chart (${uniqueLabels} > 15 labels, pie/donut requires ≤15)`);
      displayChartType = 'bar';
    }
  }
  
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

  // Chart options
  const getChartOptions = () => ({
    responsive: true,
    maintainAspectRatio: displayChartType === 'pie' || displayChartType === 'donut' ? true : true,
    animation: displayChartType === 'pie' || displayChartType === 'donut' ? false : undefined,
    onClick: displayChartType === 'pie' || displayChartType === 'donut' ? (event: any, elements: any[]) => {
      // Prevent default click behavior that might shrink the chart
      event.stopPropagation();
    } : undefined,
    layout: displayChartType === 'pie' || displayChartType === 'donut' ? {
      padding: {
        top: 20,
        bottom: 20,
        left: 20,
        right: 20
      }
    } : undefined,
    plugins: {
      legend: {
        position: (displayChartType === 'pie' || displayChartType === 'donut') ? 'bottom' : 'top' as const,
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
    scales: displayChartType !== 'pie' && displayChartType !== 'donut' ? {
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
  });

  const renderChart = () => {
    if (error) {
      return (
        <div className="h-64 flex items-center justify-center">
          <div className="text-sm text-red-500">Error: {error}</div>
        </div>
      )
    }

    if (!finalChartData) {
      return (
        <div className="h-64 flex items-center justify-center">
          <div className="text-gray-500">No data available</div>
        </div>
      )
    }

    const currentChartOptions = getChartOptions();

    switch (displayChartType) {
      case 'bar':
        return <Bar data={finalChartData} options={currentChartOptions as any} />
      case 'line':
      case 'area':
        console.log("Rendering line chart with data:", finalChartData);
        console.log("Chart options:", currentChartOptions);
        console.log("Labels for X-axis:", finalChartData.labels);
        console.log("Data for Y-axis:", finalChartData.datasets[0].data);
        
        const lineOptions = {
          ...currentChartOptions,
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
            ...currentChartOptions.plugins,
            legend: {
              ...currentChartOptions.plugins?.legend,
              display: true,
            },
          },
          scales: {
            x: {
              type: 'category', // Explicitly set as category scale
              display: true,
              title: {
                display: true,
                text: chartConfig.xAxis || 'Time Period',
                font: {
                  size: 14,
                  weight: '600' as const,
                },
                color: '#6B7280',
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.05)',
                display: true,
              },
              ticks: {
                color: '#6B7280',
                font: {
                  size: 11,
                },
                maxRotation: 45,
                minRotation: 0,
              },
            },
            y: {
              type: 'linear', // Explicitly set as linear scale
              display: true,
              title: {
                display: true,
                text: chartConfig.yAxis || 'Value',
                font: {
                  size: 14,
                  weight: '600' as const,
                },
                color: '#6B7280',
              },
              beginAtZero: true,
              grid: {
                color: 'rgba(0, 0, 0, 0.05)',
                display: true,
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
        return <Pie data={finalChartData} options={currentChartOptions as any} />
      case 'donut':
        return <Doughnut data={finalChartData} options={currentChartOptions as any} />
      default:
        return <Bar data={finalChartData} options={currentChartOptions as any} />
    }
  }

  return (
    <>
      <Card 
        className="w-full h-full flex flex-col hover:shadow-lg transition-all duration-200"
      >
      <CardHeader>
        <div className="flex items-center justify-between">
            <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{title}</CardTitle>
            </div>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
            <div className="flex gap-2 items-center">
            <Badge variant="outline" className="text-xs">
              {displayChartType.toUpperCase()}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                title="Delete this KPI metric"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 flex flex-col flex-1 min-h-0">
          {/* View Toggle - Show for all charts */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant={!showTableView ? "default" : "outline"}
                size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowTableView(false);
              }}
                className="text-xs"
              >
                <Database className="h-3 w-3 mr-1" />
                Chart
              </Button>
              <Button
                variant={showTableView ? "default" : "outline"}
                size="sm"
              onClick={(e) => {
                e.stopPropagation();
                  setShowTableView(true);
                }}
                className="text-xs"
              >
                <ChevronRight className="h-3 w-3 mr-1" />
                Table
              </Button>
            </div>
          {showTableView && (
            <div className="text-xs text-muted-foreground">
              {dataSource === 'stored' 
                ? `${finalTableData.length} rows of execution results`
                : `${finalTableData.length} rows of data`}
            </div>
          )}
          </div>

        {/* Chart or Table View - Takes remaining space */}
        <div className="flex-1 w-full min-h-0 overflow-hidden relative">
            {showTableView ? (
              <div className="h-full overflow-auto" style={{ maxHeight: '400px' }}>
                {finalTableData.length > 0 ? (
                  <div className="min-w-full">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {Object.keys(finalTableData[0]).map((key, index) => (
                            <th key={index} className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {finalTableData.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-gray-50">
                            {Object.values(row).map((value, cellIndex) => (
                              <td key={cellIndex} className="px-3 py-2 border-b border-gray-200 text-gray-900">
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
              <div className={`h-full ${displayChartType === 'pie' || displayChartType === 'donut' ? 'flex items-center justify-center' : ''}`}>
                {displayChartType === 'pie' || displayChartType === 'donut' ? (
                  <div className="w-full max-w-md max-h-80 flex items-center justify-center">
                {renderChart()}
                  </div>
                ) : (
                  renderChart()
                )}
              </div>
            )}
          </div>
          
      </CardContent>
    </Card>
    </>
  )
}
