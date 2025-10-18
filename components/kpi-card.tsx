"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Database, BarChart3, TrendingUp, Users, DollarSign, Clock, Target } from "lucide-react";
import { useState, useEffect } from "react";

interface KPICardProps {
  title: string;
  description: string;
  value?: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  category: string;
  sqlQuery: string;
  xAxisQuery?: string;
  data: any[];
  onCopyQuery: (query: string) => void;
}

const categoryIcons = {
  financial: DollarSign,
  operational: Clock,
  customer: Users,
  growth: TrendingUp,
  efficiency: Target,
  churn: Users,
  roi: DollarSign,
  otif: Clock,
  default: BarChart3,
};

const categoryColors = {
  financial: "bg-green-100 text-green-800 border-green-200",
  operational: "bg-blue-100 text-blue-800 border-blue-200",
  customer: "bg-purple-100 text-purple-800 border-purple-200",
  growth: "bg-orange-100 text-orange-800 border-orange-200",
  efficiency: "bg-cyan-100 text-cyan-800 border-cyan-200",
  churn: "bg-red-100 text-red-800 border-red-200",
  roi: "bg-emerald-100 text-emerald-800 border-emerald-200",
  otif: "bg-indigo-100 text-indigo-800 border-indigo-200",
  default: "bg-gray-100 text-gray-800 border-gray-200",
};

export function KPICard({
  title,
  description,
  value,
  trend,
  category,
  sqlQuery,
  xAxisQuery,
  data,
  onCopyQuery,
}: KPICardProps) {
  const [showQueries, setShowQueries] = useState(false);
  const [calculatedValue, setCalculatedValue] = useState<string | number>("-");
  const [sqlResults, setSqlResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const IconComponent = categoryIcons[category as keyof typeof categoryIcons] || categoryIcons.default;
  const badgeClass = categoryColors[category as keyof typeof categoryColors] || categoryColors.default;

  // Execute SQL query to get the actual value
  useEffect(() => {
    const executeQuery = async () => {
      if (!data || data.length === 0 || !sqlQuery) return;
      
      setLoading(true);
      try {
        const response = await fetch("/api/execute-sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sqlQuery, 
            data, 
            headers: Object.keys(data[0] || {})
          }),
        });
        
        const result = await response.json();
        
        if (result.results && result.results.length > 0) {
          setSqlResults(result.results);
          
          // Get the first numeric value from the results
          const firstResult = result.results[0];
          const numericValue = Object.values(firstResult).find(val => 
            typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))
          );
          
          if (numericValue !== undefined) {
            setCalculatedValue(Number(numericValue));
          } else {
            // If no numeric value, show the first value (coerce to string or number safely)
            const firstValue = Object.values(firstResult)[0];
            if (typeof firstValue === 'number') {
              setCalculatedValue(firstValue);
            } else if (typeof firstValue === 'string') {
              setCalculatedValue(firstValue);
            } else if (firstValue !== null && firstValue !== undefined) {
              // For objects/arrays convert to JSON string to keep state type-safe
              setCalculatedValue(JSON.stringify(firstValue));
            } else {
              setCalculatedValue("-");
            }
          }
        } else {
          setSqlResults([]);
          setCalculatedValue("-");
        }
      } catch (error) {
        console.error("Error executing SQL for KPI card:", error);
        setCalculatedValue("-");
      } finally {
        setLoading(false);
      }
    };

    executeQuery();
  }, [sqlQuery, data]);

  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <Card className="w-full hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <IconComponent className="h-5 w-5 text-gray-600" />
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          </div>
          <Badge className={badgeClass}>
            {category.toUpperCase()}
          </Badge>
        </div>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {loading ? (
                <span className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Loading...
                </span>
              ) : (
                formatValue(calculatedValue)
              )}
            </p>
            {trend && !loading && (
              <div className={`flex items-center text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendingUp className={`h-4 w-4 mr-1 ${
                  trend.isPositive ? '' : 'rotate-180'
                }`} />
                {trend.value}%
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics */}
        {sqlResults.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Key Insights</span>
              <Badge variant="secondary" className="text-xs">
                {sqlResults.length} data points
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(() => {
                const firstRow = sqlResults[0];
                const numericColumns = Object.entries(firstRow).filter(([key, value]) => 
                  typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)))
                );
                
                if (numericColumns.length > 0) {
                  const values = numericColumns.map(([key, value]) => Number(value));
                  const maxValue = Math.max(...values);
                  const minValue = Math.min(...values);
                  const totalValue = values.reduce((sum, val) => sum + val, 0);
                  const avgValue = totalValue / values.length;
                  
                  return (
                    <>
                      <div className="bg-green-50 p-2 rounded text-center">
                        <div className="font-semibold text-green-800">Highest</div>
                        <div className="text-green-600">{formatValue(maxValue)}</div>
                      </div>
                      <div className="bg-red-50 p-2 rounded text-center">
                        <div className="font-semibold text-red-800">Lowest</div>
                        <div className="text-red-600">{formatValue(minValue)}</div>
                      </div>
                      <div className="bg-blue-50 p-2 rounded text-center">
                        <div className="font-semibold text-blue-800">Total</div>
                        <div className="text-blue-600">{formatValue(totalValue)}</div>
                      </div>
                      <div className="bg-purple-50 p-2 rounded text-center">
                        <div className="font-semibold text-purple-800">Average</div>
                        <div className="text-purple-600">{formatValue(avgValue)}</div>
                      </div>
                    </>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {/* <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">SQL Queries</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQueries(!showQueries)}
              className="text-xs"
            >
              {showQueries ? 'Hide' : 'Show'} Queries
            </Button>
          </div> */}
          
          {showQueries && (
            <div className="space-y-3">
              {/* <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Main Query (Y-axis)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onCopyQuery(sqlQuery)}
                    className="h-6 px-2 text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="bg-gray-50 p-3 rounded-md border">
                  <code className="text-xs text-gray-700 font-mono break-all">
                    {sqlQuery}
                  </code>
                </div>
              </div> */}
              
              {xAxisQuery && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-600">X-axis Query</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCopyQuery(xAxisQuery)}
                      className="h-6 px-2 text-xs"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md border">
                    <code className="text-xs text-gray-700 font-mono break-all">
                      {xAxisQuery}
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
