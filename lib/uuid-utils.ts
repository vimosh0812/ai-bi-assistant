/**
 * UUID utility functions for consistent ID generation across the application
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID v4 string
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Generate a UUID with a custom prefix
 */
export function generatePrefixedUUID(prefix: string): string {
  return `${prefix}_${uuidv4().replace(/-/g, '')}`;
}

/**
 * Generate a datasource UUID
 */
export function generateDatasourceUUID(): string {
  return generatePrefixedUUID('DataSource');
}

/**
 * Generate a workbook UUID
 */
export function generateWorkbookUUID(): string {
  return generatePrefixedUUID('Workbook');
}

/**
 * Generate a project UUID
 */
export function generateProjectUUID(): string {
  return generatePrefixedUUID('Project');
}

/**
 * Generate an object ID for Tableau metadata records
 */
export function generateObjectId(): string {
  return uuidv4().replace(/-/g, '').toUpperCase();
}

/**
 * Generate a Tableau-friendly object ID with Extract prefix
 */
export function generateExtractObjectId(): string {
  return `Extract_${generateObjectId()}`;
}

/**
 * Generate a unique datasource name with UUID
 */
export function generateDatasourceName(baseName: string): string {
  const uuid = generateObjectId().substring(0, 8);
  return `${baseName}_${uuid}`;
}

/**
 * Generate a unique workbook name with UUID
 */
export function generateWorkbookName(baseName: string): string {
  const uuid = generateObjectId().substring(0, 8);
  return `${baseName}_${uuid}`;
}

/**
 * Generate a unique project name with UUID
 */
export function generateProjectName(baseName: string): string {
  const uuid = generateObjectId().substring(0, 8);
  return `${baseName}_${uuid}`;
}
