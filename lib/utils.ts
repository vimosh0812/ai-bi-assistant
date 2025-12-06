import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Filter out columns named "id" (case-insensitive) to avoid conflicts with PRIMARY KEY
 * Returns filtered headers and a mapping to filter corresponding data
 */
export function filterIdColumns(headers: string[]): {
  filteredHeaders: string[];
  idColumnsRemoved: string[];
  headerIndexMap: Map<number, number>; // Maps old index to new index
} {
  const filteredHeaders: string[] = [];
  const idColumnsRemoved: string[] = [];
  const headerIndexMap = new Map<number, number>();
  
  let newIndex = 0;
  headers.forEach((header, oldIndex) => {
    const normalizedHeader = header.trim().toLowerCase();
    if (normalizedHeader === 'id') {
      idColumnsRemoved.push(header);
      console.log(`⚠️ Filtered out 'id' column: "${header}" (conflicts with PRIMARY KEY)`);
    } else {
      headerIndexMap.set(oldIndex, newIndex);
      filteredHeaders.push(header);
      newIndex++;
    }
  });
  
  if (idColumnsRemoved.length > 0) {
    console.log(`📋 ID column filtering: Removed ${idColumnsRemoved.length} column(s), ${filteredHeaders.length} columns remaining`);
  }
  
  return { filteredHeaders, idColumnsRemoved, headerIndexMap };
}

/**
 * Filter data rows to match filtered headers (removes 'id' column values)
 */
export function filterIdColumnsFromData(
  data: Record<string, any>[],
  headers: string[],
  filteredHeaders: string[]
): Record<string, any>[] {
  if (filteredHeaders.length === headers.length) {
    // No filtering needed
    return data;
  }
  
  return data.map(row => {
    const filteredRow: Record<string, any> = {};
    filteredHeaders.forEach(header => {
      filteredRow[header] = row[header];
    });
    return filteredRow;
  });
}
