/**
 * OLAP (Online Analytical Processing) utility functions
 * Provides quarter-based aggregation and time-series analysis
 */

export interface QuarterData {
  quarter: string; // "Q1", "Q2", "Q3", "Q4"
  year: number;
  value: number;
  label: string; // "2021 Q1", "2021 Q2", etc.
}

/**
 * Convert month number to quarter
 */
export function monthToQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Format quarter label
 */
export function formatQuarterLabel(year: number, quarter: number): string {
  return `${year} Q${quarter}`;
}

/**
 * Aggregate data by quarters
 */
export function aggregateByQuarter(
  data: any[],
  yearColumn: string,
  monthColumn: string,
  valueColumn: string
): QuarterData[] {
  const quarterMap = new Map<string, QuarterData>();

  data.forEach((row) => {
    const year = Number(row[yearColumn]) || 0;
    const month = Number(row[monthColumn]) || 0;
    const value = Number(row[valueColumn]) || 0;

    if (year > 0 && month > 0 && month <= 12) {
      const quarter = monthToQuarter(month);
      const key = `${year}-Q${quarter}`;

      if (!quarterMap.has(key)) {
        quarterMap.set(key, {
          quarter: `Q${quarter}`,
          year,
          value: 0,
          label: formatQuarterLabel(year, quarter),
        });
      }

      const quarterData = quarterMap.get(key)!;
      quarterData.value += value;
    }
  });

  // Sort by year and quarter
  return Array.from(quarterMap.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return parseInt(a.quarter.slice(1)) - parseInt(b.quarter.slice(1));
  });
}

/**
 * Determine if line chart should be used based on data points
 * Use line chart if:
 * - More than 3 months of data
 * - More than 3 years of data
 * - Time-series data with continuous trend
 */
export function shouldUseLineChart(
  data: any[],
  xAxisColumn?: string,
  chartType?: string
): boolean {
  // If already specified as line chart, use it
  if (chartType === 'line' || chartType === 'area') {
    return true;
  }

  if (!data || data.length === 0) {
    return false;
  }

  // Check if it's time-series data
  const firstRow = data[0];
  const columns = Object.keys(firstRow);
  
  const hasTimeColumn = columns.some(col => 
    col.toLowerCase().includes('year') || 
    col.toLowerCase().includes('month') || 
    col.toLowerCase().includes('date') ||
    col.toLowerCase().includes('quarter')
  );

  if (!hasTimeColumn) {
    return false;
  }

  // Count unique time periods
  const timeValues = new Set<string>();
  
  data.forEach(row => {
    columns.forEach(col => {
      const lowerCol = col.toLowerCase();
      if (lowerCol.includes('year') || lowerCol.includes('month') || lowerCol.includes('quarter')) {
        const value = row[col];
        if (value !== null && value !== undefined) {
          timeValues.add(String(value));
        }
      }
    });
  });

  // Use line chart if more than 3 time periods
  return timeValues.size > 3;
}

/**
 * Get OLAP color palette for charts
 */
export function getOLAPColors(): string[] {
  return ["#45B7D1", "#96CEB4", "#FF6B6B", "#4ECDC4"];
}

/**
 * Generate SQL query for quarter aggregation
 */
export function generateQuarterQuery(
  tableName: string,
  yearColumn: string,
  monthColumn: string,
  valueColumn: string,
  aggregation: 'SUM' | 'AVG' | 'COUNT' = 'SUM'
): string {
  return `
    SELECT 
      CAST(${yearColumn} AS NUMERIC) as year,
      CASE 
        WHEN CAST(${monthColumn} AS NUMERIC) <= 3 THEN 1
        WHEN CAST(${monthColumn} AS NUMERIC) <= 6 THEN 2
        WHEN CAST(${monthColumn} AS NUMERIC) <= 9 THEN 3
        ELSE 4
      END as quarter,
      ${aggregation}(CAST(${valueColumn} AS NUMERIC)) as value
    FROM "${tableName}"
    WHERE ${yearColumn} IS NOT NULL 
      AND ${monthColumn} IS NOT NULL
    GROUP BY CAST(${yearColumn} AS NUMERIC), 
             CASE 
               WHEN CAST(${monthColumn} AS NUMERIC) <= 3 THEN 1
               WHEN CAST(${monthColumn} AS NUMERIC) <= 6 THEN 2
               WHEN CAST(${monthColumn} AS NUMERIC) <= 9 THEN 3
               ELSE 4
             END
    ORDER BY year, quarter
  `;
}

