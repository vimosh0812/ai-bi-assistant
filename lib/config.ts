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
  TEMPLATE_DATASOURCE_NAME: 'dandan003',
} as const;

// File naming patterns
export const FILE_PATTERNS = {
  // Template workbook file path
  TEMPLATE_WORKBOOK_PATH: 'data/new-ds.twb',
  
  // Template workbook filename
  TEMPLATE_WORKBOOK_FILENAME: 'new-ds.twb',
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
  
  // Tableau server configuration
  DEFAULT_SERVER_URL: process.env.TABLEAU_SERVER_URL || 'https://prod-in-a.online.tableau.com',
  DEFAULT_API_VERSION: process.env.TABLEAU_API_VERSION || '3.20',
  DEFAULT_SITE_ID: process.env.TABLEAU_SITE_ID || '',
  DEFAULT_CONTENT_URL: process.env.TABLEAU_CONTENT_URL || '',
  DEFAULT_PERSONAL_ACCESS_TOKEN: process.env.TABLEAU_PERSONAL_ACCESS_TOKEN || '',
  DEFAULT_PERSONAL_ACCESS_TOKEN_NAME: process.env.TABLEAU_PERSONAL_ACCESS_TOKEN_NAME || '',
  DEFAULT_PROJECT_ID: process.env.TABLEAU_PROJECT_ID || '',
} as const;

// Allowed file extensions
export const ALLOWED_EXTENSIONS = {
  WORKBOOK: ['.twb', '.twbx', '.hyper'],
  DATASOURCE: ['.hyper', '.tds', '.tdsx', '.csv'],
} as const;
