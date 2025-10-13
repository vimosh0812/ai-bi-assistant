'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_NAMES, ALLOWED_EXTENSIONS } from '@/lib/config';

interface PublishResponse {
  success: boolean;
  message: string;
  data?: {
    workbook: {
      id: string;
      name: string;
      contentUrl: string;
      webpageUrl: string;
      sheetUrl?: string;
      showTabs: boolean;
      size: number;
      createdAt: string;
      updatedAt: string;
      encryptExtracts: boolean;
      project: {
        id: string;
        name: string;
      };
      owner: {
        id: string;
      };
      views: Array<{
        id: string;
        name: string;
        contentUrl: string;
        createdAt: string;
        updatedAt: string;
      }>;
    };
  };
}

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface PublishDataSourceResponse {
  success: boolean;
  message: string;
  datasourceUrl?: string | null;
  workbookUrl?: string | null;
  projectName?: string;
  data?: {
    datasource: {
      id: string;
      name: string;
      contentUrl: string;
      webpageUrl: string;
      sheetUrl?: string;
      size: number;
      createdAt: string;
      updatedAt: string;
      encryptExtracts: boolean;
      project: {
        id: string;
        name: string;
      };
      owner: {
        id: string;
      };
    };
    workbook?: {
      id: string;
      name: string;
      webpageUrl: string;
      sheetUrl?: string;
    } | null;
    project?: {
      id: string;
      name: string;
      description: string;
    };
    connected?: boolean;
  };
}

export default function AnalyticsContent() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [response, setResponse] = useState<PublishResponse | null>(null);
  const [datasourceResponse, setDatasourceResponse] = useState<PublishDataSourceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishType, setPublishType] = useState<'workbook' | 'datasource'>('workbook');
  const [copied, setCopied] = useState(false);

  const generateEmbedCode = (sheetUrl: string) => {
    return `<script type='module' src='https://prod-in-a.online.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js'></script>
<tableau-viz 
  id='tableau-viz' 
  src='${sheetUrl}' 
  width='1470' 
  height='791' 
  hide-tabs 
  toolbar='bottom'>
</tableau-viz>`;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Auto-detect file type
      const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
      
      if (ALLOWED_EXTENSIONS.DATASOURCE.includes(fileExtension as '.hyper' | '.tds' | '.tdsx' | '.csv')) {
        setPublishType('datasource');
      } else if (ALLOWED_EXTENSIONS.WORKBOOK.includes(fileExtension as '.twb' | '.twbx' | '.hyper')) {
        setPublishType('workbook');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setError(null);
    setResponse(null);
    setDatasourceResponse(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Use names from constants
      let endpoint = '';
      if (publishType === 'workbook') {
        formData.append('workbookName', DEFAULT_NAMES.WORKBOOK_NAME);
        formData.append('showTabs', 'true');
        formData.append('overwrite', 'false');
        formData.append('encryptExtracts', 'false');
        endpoint = '/api/publish-workbook';
      } else {
        formData.append('datasourceName', DEFAULT_NAMES.DATA_SOURCE_NAME);
        formData.append('overwrite', 'false');
        formData.append('encryptExtracts', 'false');
        endpoint = '/api/publish-datasource';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to publish ${publishType}`);
      }

      if (publishType === 'workbook') {
        setResponse(data);
      } else {
        setDatasourceResponse(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">
              Tableau Publisher
            </h1>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Upload */}
              <div>
                <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">
                  Select File
                </label>
                <input
                  type="file"
                  id="file"
                  accept=".twb,.twbx,.hyper,.tds,.tdsx,.csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  Supported formats: .twb, .twbx (workbooks), .hyper, .tds, .tdsx, .csv (data sources) (Max 64MB)
                </p>
              </div>

              {/* Publish Type Indicator */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-800">
                      <strong>Publishing as:</strong> {publishType === 'workbook' ? 'Workbook' : 'Data Source'}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {publishType === 'workbook' 
                        ? 'Workbooks (.twb, .twbx) are published to the workbooks endpoint'
                        : 'Data sources (.hyper, .tds, .tdsx, .csv) are published to the datasources endpoint. CSV files are automatically converted to Hyper format.'
                      }
                    </p>
                  </div>
                </div>
              </div>


              {/* Auto-generated Info */}
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-green-800">
                      <strong>Auto-generated:</strong> Name, project, and settings will be automatically configured
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Using default names: {publishType === 'workbook' ? DEFAULT_NAMES.WORKBOOK_NAME : DEFAULT_NAMES.DATA_SOURCE_NAME}
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isUploading || !file}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Publishing...' : 'Publish to Tableau'}
                </button>
              </div>
            </form>

            {/* Error Display */}
            {error && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Success Response - Workbook */}
            {response && response.success && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Workbook Published Successfully!</h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p className="font-medium">{response.message}</p>
                      {response.data && (
                        <div className="mt-3 space-y-2">
                          <p><strong>Workbook ID:</strong> {response.data.workbook.id}</p>
                          <p><strong>Name:</strong> {response.data.workbook.name}</p>
                          <p><strong>Size:</strong> {response.data.workbook.size} MB</p>
                          <p><strong>Created:</strong> {new Date(response.data.workbook.createdAt).toLocaleString()}</p>
                          {response.data.workbook.webpageUrl && (
                            <p>
                              <strong>View in Tableau:</strong>{' '}
                              <a 
                                href={response.data.workbook.webpageUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-500 underline"
                              >
                                Open Workbook
                              </a>
                            </p>
                          )}
                          {response.data.workbook.sheetUrl && (
                            <p>
                              <strong>Sheet URL:</strong>{' '}
                              <a 
                                href={response.data.workbook.sheetUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-500 underline"
                              >
                                Open Sheet
                              </a>
                            </p>
                          )}
                          {response.data.workbook.views.length > 0 && (
                            <div className="mt-3">
                              <p className="font-medium">Views:</p>
                              <ul className="list-disc list-inside space-y-1">
                                {response.data.workbook.views.map((view) => (
                                  <li key={view.id}>{view.name}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {/* Embed Code Section */}
                          {response.data.workbook.sheetUrl && (
                            <div className="mt-4 p-4 bg-gray-50 rounded-md">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-gray-900">Embed Code</h4>
                                <button
                                  onClick={() => copyToClipboard(generateEmbedCode(response.data?.workbook.sheetUrl!))}
                                  className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  {copied ? 'Copied!' : 'Copy Code'}
                                </button>
                              </div>
                              <pre className="text-xs text-gray-600 bg-white p-3 rounded border overflow-x-auto whitespace-pre-wrap break-words">
                                <code>{generateEmbedCode(response.data.workbook.sheetUrl)}</code>
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Success Response - Data Source */}
            {datasourceResponse && datasourceResponse.success && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Data Source Published Successfully!</h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p className="font-medium">{datasourceResponse.message}</p>
                      {datasourceResponse.data && (
                        <div className="mt-3 space-y-2">
                          <p><strong>Data Source ID:</strong> {datasourceResponse.data.datasource.id}</p>
                          <p><strong>Name:</strong> {datasourceResponse.data.datasource.name}</p>
                          <p><strong>Size:</strong> {datasourceResponse.data.datasource.size} MB</p>
                          <p><strong>Created:</strong> {new Date(datasourceResponse.data.datasource.createdAt).toLocaleString()}</p>
                          {datasourceResponse.projectName && (
                            <p><strong>Project Created:</strong> {datasourceResponse.projectName}</p>
                          )}
                          {datasourceResponse.data.datasource.webpageUrl && (
                            <p>
                              <strong>View in Tableau:</strong>{' '}
                              <a 
                                href={datasourceResponse.data.datasource.webpageUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-500 underline"
                              >
                                Open Data Source
                              </a>
                            </p>
                          )}
                          {datasourceResponse.data.datasource.sheetUrl && (
                            <p>
                              <strong>Sheet URL:</strong>{' '}
                              <a 
                                href={datasourceResponse.data.datasource.sheetUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-500 underline"
                              >
                                Open Sheet
                              </a>
                            </p>
                          )}
                          {/* Workbook link if available */}
                          {(datasourceResponse.workbookUrl || datasourceResponse.data.workbook?.webpageUrl) && (
                            <p>
                              <strong>Workbook:</strong>{' '}
                              <a 
                                href={datasourceResponse.workbookUrl || datasourceResponse.data.workbook?.webpageUrl || '#'} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-500 underline"
                              >
                                Open Workbook
                              </a>
                            </p>
                          )}
                          {/* Workbook Sheet URL if available */}
                          {datasourceResponse.data.workbook?.sheetUrl && (
                            <p>
                              <strong>Workbook Sheet URL:</strong>{' '}
                              <a 
                                href={datasourceResponse.data.workbook.sheetUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-500 underline"
                              >
                                Open Workbook Sheet
                              </a>
                            </p>
                          )}
                          {typeof datasourceResponse.data.connected === 'boolean' && (
                            <p>
                              <strong>Connected:</strong> {datasourceResponse.data.connected ? 'Yes' : 'Not verified'}
                            </p>
                          )}
                          {/* Embed Code Section for Workbook (if available) */}
                          {datasourceResponse.data.workbook?.sheetUrl && (
                            <div className="mt-4 p-4 bg-gray-50 rounded-md">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-gray-900">Workbook Embed Code</h4>
                                <button
                                  onClick={() => copyToClipboard(generateEmbedCode(datasourceResponse.data?.workbook?.sheetUrl!))}
                                  className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                  {copied ? 'Copied!' : 'Copy Code'}
                                </button>
                              </div>
                              <pre className="text-xs text-gray-600 bg-white p-3 rounded border overflow-x-auto whitespace-pre-wrap break-words">
                                <code>{generateEmbedCode(datasourceResponse.data.workbook.sheetUrl)}</code>
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
