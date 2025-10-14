/**
 * Configuration constants for Tableau publishing
 * These can be easily modified to change default names and settings
 */

// Default names for published content
export const DEFAULT_NAMES = {
  // Default data source name - can be overridden by user input
  DATA_SOURCE_NAME: 'MyDataSource',
  
  // Default workbook name - can be overridden by user input  
  WORKBOOK_NAME: 'MyWorkbook',
  
  // Template datasource name used in workbook template replacement
  TEMPLATE_DATASOURCE_NAME: 'MyDataSource',
  
  // UUID-based naming patterns
  UUID_PREFIXES: {
    DATASOURCE: 'DataSource',
    WORKBOOK: 'Workbook', 
    PROJECT: 'Project',
    EXTRACT: 'Extract',
  },
} as const;

// File naming patterns
export const FILE_PATTERNS = {
  // Generated workbook filename
  GENERATED_WORKBOOK_FILENAME: 'workbook.twb',
} as const;

// Tableau publishing settings
export const TABLEAU_SETTINGS = {
  // Default project settings
  DEFAULT_PROJECT_NAME: 'Default',
  
  // Default workbook settings
  DEFAULT_SHOW_TABS: true,
  DEFAULT_OVERWRITE: false,
  DEFAULT_ENCRYPT_EXTRACTS: false,
  
  // File size limits
  MAX_FILE_SIZE_MB: 64,
} as const;

// Allowed file extensions
export const ALLOWED_EXTENSIONS = {
  WORKBOOK: ['.twb', '.twbx', '.hyper'],
  DATASOURCE: ['.hyper', '.tds', '.tdsx', '.csv'],
} as const;
