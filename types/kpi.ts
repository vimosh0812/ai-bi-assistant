export interface KPIMetric {
  id: string;
  name: string;
  description: string;
  value: number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  change?: number;
  changeType?: 'percentage' | 'absolute';
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'donut' | 'scatter';
  sqlQuery: string;
  chartConfig: {
    title: string;
    xAxis?: string;
    yAxis?: string;
    groupBy?: string;
    colors?: string[];
    dataLabels?: boolean;
  };
  data: any[];
  category: 'financial' | 'operational' | 'customer' | 'growth' | 'efficiency';
  priority: 'high' | 'medium' | 'low';
}

export interface KPIDashboard {
  id: string;
  fileId: string;
  name: string;
  description: string;
  metrics: KPIMetric[];
  createdAt: string;
  updatedAt: string;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }[];
}

export interface KPIMetricAnalysis {
  name: string;
  sqlQuery: string;
  xAxisQuery: string;
  description: string;
  chartType: string;
  chartConfig: {
    title: string;
    xAxis?: string;
    yAxis?: string;
    groupBy?: string;
    colors?: string[];
    dataLabels?: boolean;
  };
  category: string;
}

export interface OpenAIKPIAnalysis {
  metrics: KPIMetricAnalysis[];
  summary: string;
}
