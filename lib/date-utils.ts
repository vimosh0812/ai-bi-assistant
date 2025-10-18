/**
 * Utility functions for detecting and splitting date columns
 */

export interface DateColumnInfo {
  columnName: string;
  hasDate: boolean;
  dateFormat?: string;
  sampleValues: string[];
}

export interface SplitDateResult {
  originalColumn: string;
  yearColumn: string;
  monthColumn: string;
  dayColumn: string;
  yearValues: (number | null)[];
  monthValues: (number | null)[];
  dayValues: (number | null)[];
}

/**
 * Common date patterns to detect various date formats
 */
const DATE_PATTERNS = [
  // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/,
  // MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY
  /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/,
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/,
  // YYYY-MM-DD HH:mm:ss, YYYY/MM/DD HH:mm:ss
  /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{1,2}(:\d{1,2})?$/,
  // MM/DD/YYYY HH:mm:ss, MM-DD-YYYY HH:mm:ss
  /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\s+\d{1,2}:\d{1,2}(:\d{1,2})?$/,
  // DD/MM/YYYY HH:mm:ss, DD-MM-YYYY HH:mm:ss
  /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\s+\d{1,2}:\d{1,2}(:\d{1,2})?$/,
  // Month DD, YYYY (e.g., "January 15, 2024")
  /^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/,
  // DD Month YYYY (e.g., "15 January 2024")
  /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/,
  // Month YYYY (e.g., "January 2024")
  /^[A-Za-z]+\s+\d{4}$/,
  // YYYY-MM (e.g., "2024-01")
  /^\d{4}[-/.]\d{1,2}$/,
  // MM/YYYY, MM-YYYY, MM.YYYY
  /^\d{1,2}[-/.]\d{4}$/,
  // UTC DateTime formats
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?[+-]\d{2}:\d{2}$/,
  // Additional datetime formats
  /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(\.\d{3})?$/,
  /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\s+\d{1,2}:\d{1,2}:\d{1,2}(\.\d{3})?$/,
];

/**
 * Patterns that look like dates but are likely not dates
 */
const NON_DATE_PATTERNS = [
  // Phone numbers
  /^\d{3}[-.]?\d{3}[-.]?\d{4}$/,
  // Social Security Numbers
  /^\d{3}[-.]?\d{2}[-.]?\d{4}$/,
  // Credit card numbers (basic pattern)
  /^\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}$/,
  // Version numbers
  /^\d+\.\d+(\.\d+)?$/,
  // Decimal numbers
  /^\d+\.\d+$/,
  // Simple numeric IDs
  /^\d{1,6}$/,
  // Product codes with slashes
  /^[A-Z0-9]+\/[A-Z0-9]+$/,
];

/**
 * Column names that are likely not dates
 */
const NON_DATE_COLUMN_NAMES = [
  'id', 'ID', 'Id', 'identifier', 'Identifier', 'key', 'Key', 'code', 'Code',
  'number', 'Number', 'num', 'Num', 'no', 'No', 'ref', 'Ref', 'reference',
  'version', 'Version', 'ver', 'Ver', 'v', 'V', 'phone', 'Phone', 'mobile',
  'email', 'Email', 'address', 'Address', 'zip', 'Zip', 'postal', 'Postal',
  'price', 'Price', 'cost', 'Cost', 'amount', 'Amount', 'value', 'Value',
  'quantity', 'Quantity', 'qty', 'Qty', 'count', 'Count', 'total', 'Total',
  'sum', 'Sum', 'average', 'Average', 'mean', 'Mean', 'score', 'Score',
  'rating', 'Rating', 'rank', 'Rank', 'position', 'Position', 'order', 'Order',
  'sequence', 'Sequence', 'index', 'Index', 'serial', 'Serial', 'item', 'Item',
  'product', 'Product', 'sku', 'SKU', 'barcode', 'Barcode', 'upc', 'UPC',
  'ean', 'EAN', 'isbn', 'ISBN', 'asin', 'ASIN', 'model', 'Model', 'type',
  'Type', 'category', 'Category', 'class', 'Class', 'group', 'Group',
  'status', 'Status', 'state', 'State', 'flag', 'Flag', 'active', 'Active',
  'enabled', 'Enabled', 'visible', 'Visible', 'public', 'Public', 'private',
  'Private', 'level', 'Level', 'grade', 'Grade', 'priority', 'Priority',
  'weight', 'Weight', 'height', 'Height', 'width', 'Width', 'length', 'Length',
  'size', 'Size', 'capacity', 'Capacity', 'volume', 'Volume', 'area', 'Area',
  'distance', 'Distance', 'speed', 'Speed', 'rate', 'Rate', 'ratio', 'Ratio',
  'percentage', 'Percentage', 'percent', 'Percent', 'pct', 'Pct', 'fraction',
  'Fraction', 'decimal', 'Decimal', 'integer', 'Integer', 'float', 'Float',
  'double', 'Double', 'long', 'Long', 'short', 'Short', 'byte', 'Byte',
  'bit', 'Bit', 'boolean', 'Boolean', 'bool', 'Bool', 'true', 'True',
  'false', 'False', 'yes', 'Yes', 'no', 'No', 'y', 'Y', 'n', 'N'
];

/**
 * Month name to number mapping
 */
const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Detects if a column contains date data
 */
export function detectDateColumn(
  columnName: string,
  values: any[],
  sampleSize: number = 10
): DateColumnInfo {
  const nonNullValues = values
    .filter(val => val !== null && val !== undefined && val !== '')
    .map(val => String(val).trim())
    .slice(0, sampleSize);

  if (nonNullValues.length === 0) {
    return {
      columnName,
      hasDate: false,
      sampleValues: []
    };
  }

  // First check: Column name analysis - if it's clearly not a date column, skip
  const normalizedColumnName = columnName.toLowerCase().replace(/[^a-z]/g, '');
  if (NON_DATE_COLUMN_NAMES.some(name => normalizedColumnName.includes(name.toLowerCase()))) {
    return {
      columnName,
      hasDate: false,
      sampleValues: nonNullValues.slice(0, 5)
    };
  }

  // Second check: Look for non-date patterns first
  let nonDateCount = 0;
  for (const value of nonNullValues) {
    if (NON_DATE_PATTERNS.some(pattern => pattern.test(value))) {
      nonDateCount++;
    }
  }

  // If more than 30% match non-date patterns, it's likely not a date column
  if (nonDateCount > nonNullValues.length * 0.3) {
    return {
      columnName,
      hasDate: false,
      sampleValues: nonNullValues.slice(0, 5)
    };
  }

  // Third check: Look for actual date patterns
  let dateCount = 0;
  let validDateCount = 0;
  const sampleValues = nonNullValues.slice(0, 5);

  for (const value of nonNullValues) {
    // Check if it matches any date pattern
    const matchesPattern = DATE_PATTERNS.some(pattern => pattern.test(value));
    
    // Try to parse the date with different approaches
    let isValidDate = false;
    let parsedDate: Date | null = null;
    
    if (matchesPattern) {
      // For pattern-matched values, try different parsing approaches
      const dateStr = value.trim();
      
      // Try direct parsing first
      parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        isValidDate = parsedDate.getFullYear() >= 1900 && parsedDate.getFullYear() <= 2100;
      }
      
      // If direct parsing fails, try manual parsing for DD/MM/YYYY format
      if (!isValidDate) {
        const ddmmMatch = dateStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        if (ddmmMatch) {
          const day = parseInt(ddmmMatch[1], 10);
          const month = parseInt(ddmmMatch[2], 10);
          const year = parseInt(ddmmMatch[3], 10);
          
          // Check if it's likely DD/MM/YYYY (day > 12 or month > 12)
          if (day > 12 || month > 12) {
            parsedDate = new Date(year, month - 1, day);
            isValidDate = !isNaN(parsedDate.getTime()) && 
                         year >= 1900 && year <= 2100 &&
                         day >= 1 && day <= 31 &&
                         month >= 1 && month <= 12;
          } else {
            // Ambiguous case - try both MM/DD/YYYY and DD/MM/YYYY
            const mmddDate = new Date(year, month - 1, day);
            const ddmmDate = new Date(year, day - 1, month);
            
            // Use the one that makes more sense (valid date)
            if (!isNaN(mmddDate.getTime()) && !isNaN(ddmmDate.getTime())) {
              // Both are valid, prefer MM/DD/YYYY for US format
              parsedDate = mmddDate;
              isValidDate = year >= 1900 && year <= 2100;
            } else if (!isNaN(mmddDate.getTime())) {
              parsedDate = mmddDate;
              isValidDate = year >= 1900 && year <= 2100;
            } else if (!isNaN(ddmmDate.getTime())) {
              parsedDate = ddmmDate;
              isValidDate = year >= 1900 && year <= 2100;
            }
          }
        }
      }
      
      if (isValidDate) {
        dateCount++;
        validDateCount++;
      }
    } else {
      // For non-pattern values, be more strict
      parsedDate = new Date(value);
      isValidDate = !isNaN(parsedDate.getTime()) && 
                   value.length >= 8 &&
                   parsedDate.getFullYear() >= 1900 && 
                   parsedDate.getFullYear() <= 2100;
      
      if (isValidDate) {
        // Only count as date if it has month names or specific date-like structure
        const hasMonthName = /[A-Za-z]/.test(value);
        const hasDateStructure = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(value) || 
                                /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(value);
        
        if (hasMonthName || hasDateStructure) {
          dateCount++;
          validDateCount++;
        }
      }
    }
  }

  // Be more conservative: require both pattern matching AND valid date parsing
  // Also require higher percentage of valid dates
  const hasDate = dateCount >= Math.max(2, nonNullValues.length * 0.8) && 
                  validDateCount >= Math.max(2, nonNullValues.length * 0.7);

  return {
    columnName,
    hasDate,
    sampleValues,
    dateFormat: hasDate ? 'detected' : undefined
  };
}

/**
 * Parses a date string and extracts year, month, day
 */
function parseDateComponents(dateStr: string): { year: number | null; month: number | null; day: number | null } {
  if (!dateStr || typeof dateStr !== 'string') {
    return { year: null, month: null, day: null };
  }

  const trimmed = dateStr.trim();
  
  // Try parsing as ISO date first (handles UTC and most standard formats)
  const isoDate = new Date(trimmed);
  if (!isNaN(isoDate.getTime())) {
    return {
      year: isoDate.getFullYear(),
      month: isoDate.getMonth() + 1,
      day: isoDate.getDate()
    };
  }

  // Handle "Month DD, YYYY" format
  const monthDayYearMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (monthDayYearMatch) {
    const monthName = monthDayYearMatch[1].toLowerCase();
    const day = parseInt(monthDayYearMatch[2], 10);
    const year = parseInt(monthDayYearMatch[3], 10);
    const month = MONTH_NAMES[monthName];
    
    if (month) {
      return { year, month, day };
    }
  }

  // Handle "DD Month YYYY" format
  const dayMonthYearMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayMonthYearMatch) {
    const day = parseInt(dayMonthYearMatch[1], 10);
    const monthName = dayMonthYearMatch[2].toLowerCase();
    const year = parseInt(dayMonthYearMatch[3], 10);
    const month = MONTH_NAMES[monthName];
    
    if (month) {
      return { year, month, day };
    }
  }

  // Handle "Month YYYY" format
  const monthYearMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const monthName = monthYearMatch[1].toLowerCase();
    const year = parseInt(monthYearMatch[2], 10);
    const month = MONTH_NAMES[monthName];
    
    if (month) {
      return { year, month, day: null };
    }
  }

  // Handle "YYYY-MM" format
  const yearMonthMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1], 10);
    const month = parseInt(yearMonthMatch[2], 10);
    return { year, month, day: null };
  }

  // Handle "MM/YYYY" format
  const monthYearSlashMatch = trimmed.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (monthYearSlashMatch) {
    const month = parseInt(monthYearSlashMatch[1], 10);
    const year = parseInt(monthYearSlashMatch[2], 10);
    return { year, month, day: null };
  }

  // Handle "YYYY" format (year only)
  const yearOnlyMatch = trimmed.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    return { year, month: null, day: null };
  }

  // Handle numeric date formats (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD)
  const numericMatch = trimmed.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (numericMatch) {
    const part1 = parseInt(numericMatch[1], 10);
    const part2 = parseInt(numericMatch[2], 10);
    const part3 = parseInt(numericMatch[3], 10);
    
    // Determine format based on part lengths and values
    if (part1 > 31) { 
      // YYYY-MM-DD format
      return { year: part1, month: part2, day: part3 };
    } else if (part3 > 31) { 
      // MM/DD/YYYY format
      return { year: part3, month: part1, day: part2 };
    } else if (part1 > 12 && part2 <= 12) {
      // DD/MM/YYYY or DD-MM-YYYY format (day > 12, month <= 12)
      return { year: part3, month: part2, day: part1 };
    } else if (part2 > 12 && part1 <= 12) {
      // MM/DD/YYYY or MM-DD-YYYY format (month > 12, day <= 12) - less common but possible
      return { year: part3, month: part1, day: part2 };
    } else {
      // Ambiguous case - try both and see which makes sense
      const mmddDate = new Date(part3, part1 - 1, part2);
      const ddmmDate = new Date(part3, part2 - 1, part1);
      
      // Check if both are valid dates
      const mmddValid = !isNaN(mmddDate.getTime()) && 
                       mmddDate.getFullYear() === part3 &&
                       mmddDate.getMonth() === part1 - 1 &&
                       mmddDate.getDate() === part2;
      const ddmmValid = !isNaN(ddmmDate.getTime()) && 
                       ddmmDate.getFullYear() === part3 &&
                       ddmmDate.getMonth() === part2 - 1 &&
                       ddmmDate.getDate() === part1;
      
      if (mmddValid && ddmmValid) {
        // Both are valid - prefer MM/DD/YYYY (US format) for ambiguous cases
        return { year: part3, month: part1, day: part2 };
      } else if (mmddValid) {
        return { year: part3, month: part1, day: part2 };
      } else if (ddmmValid) {
        return { year: part3, month: part2, day: part1 };
      } else {
        // Default to DD/MM/YYYY if neither works
        return { year: part3, month: part2, day: part1 };
      }
    }
  }

  return { year: null, month: null, day: null };
}

/**
 * Splits a date column into separate year, month, and day columns
 */
export function splitDateColumn(
  columnName: string,
  values: any[]
): SplitDateResult {
  const yearColumn = `${columnName}_year`;
  const monthColumn = `${columnName}_month`;
  const dayColumn = `${columnName}_day`;

  const yearValues: (number | null)[] = [];
  const monthValues: (number | null)[] = [];
  const dayValues: (number | null)[] = [];

  for (const value of values) {
    const { year, month, day } = parseDateComponents(String(value || ''));
    yearValues.push(year);
    monthValues.push(month);
    dayValues.push(day);
  }

  return {
    originalColumn: columnName,
    yearColumn,
    monthColumn,
    dayColumn,
    yearValues,
    monthValues,
    dayValues
  };
}

/**
 * Processes all columns to detect and split date columns
 */
export function processDateColumns(
  headers: string[],
  data: Record<string, any>[]
): {
  newHeaders: string[];
  newData: Record<string, any>[];
  dateColumnsProcessed: string[];
  dateColumnsInfo: { [key: string]: { originalFormat: string; sampleValues: string[] } };
} {
  const newHeaders = [...headers];
  const newData = data.map(row => ({ ...row }));
  const dateColumnsProcessed: string[] = [];
  const dateColumnsInfo: { [key: string]: { originalFormat: string; sampleValues: string[] } } = {};

  // Detect date columns
  const dateColumns: string[] = [];
  for (const header of headers) {
    const values = data.map(row => row[header]);
    const dateInfo = detectDateColumn(header, values);
    
    if (dateInfo.hasDate) {
      dateColumns.push(header);
      dateColumnsInfo[header] = {
        originalFormat: dateInfo.dateFormat || 'detected',
        sampleValues: dateInfo.sampleValues
      };
    }
  }

  // Log detected date columns
  if (dateColumns.length > 0) {
    console.log(`📅 Date columns detected and will be split: ${dateColumns.join(', ')}`);
    dateColumns.forEach(col => {
      console.log(`  - ${col}: ${dateColumnsInfo[col].sampleValues.slice(0, 3).join(', ')}${dateColumnsInfo[col].sampleValues.length > 3 ? '...' : ''}`);
    });
  }

  // Process each date column
  for (const dateColumn of dateColumns) {
    const values = data.map(row => row[dateColumn]);
    const splitResult = splitDateColumn(dateColumn, values);

    // Remove original date column from headers
    const originalIndex = newHeaders.indexOf(dateColumn);
    if (originalIndex !== -1) {
      newHeaders.splice(originalIndex, 1);
    }

    // Add new date columns to headers
    newHeaders.push(splitResult.yearColumn, splitResult.monthColumn, splitResult.dayColumn);

    // Update data rows
    newData.forEach((row, index) => {
      // Remove original date column
      delete row[dateColumn];
      
      // Add new date columns
      row[splitResult.yearColumn] = splitResult.yearValues[index];
      row[splitResult.monthColumn] = splitResult.monthValues[index];
      row[splitResult.dayColumn] = splitResult.dayValues[index];
    });

    dateColumnsProcessed.push(dateColumn);
  }

  return {
    newHeaders,
    newData,
    dateColumnsProcessed,
    dateColumnsInfo
  };
}
