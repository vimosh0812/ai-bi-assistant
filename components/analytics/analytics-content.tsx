'use client';

import { useState, useEffect } from 'react';

interface PublishResponse {
  success: boolean;
  message: string;
  data?: {
    workbook: {
      id: string;
      name: string;
      contentUrl: string;
      webpageUrl: string;
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
  data?: {
    datasource: {
      id: string;
      name: string;
      contentUrl: string;
      webpageUrl: string;
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
    } | null;
    connected?: boolean;
  };
}

export default function AnalyticsContent() {
  const [file, setFile] = useState<File | null>(null);
  const [workbookName, setWorkbookName] = useState('');
  const [datasourceName, setDatasourceName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [showTabs, setShowTabs] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [encryptExtracts, setEncryptExtracts] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [response, setResponse] = useState<PublishResponse | null>(null);
  const [datasourceResponse, setDatasourceResponse] = useState<PublishDataSourceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [publishType, setPublishType] = useState<'workbook' | 'datasource'>('workbook');

  // Fetch projects on component mount
  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const res = await fetch('/api/get-projects');
      const data = await res.json();
      
      if (data.success) {
        setProjects(data.projects);
      } else {
        console.error('Failed to fetch projects:', data.error);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Auto-fill name based on file type
      const nameWithoutExtension = selectedFile.name.replace(/\.[^/.]+$/, '');
      const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
      
      if (['.hyper', '.tds', '.tdsx'].includes(fileExtension)) {
        setPublishType('datasource');
        if (!datasourceName) {
          setDatasourceName(nameWithoutExtension);
        }
      } else if (['.twb', '.twbx'].includes(fileExtension)) {
        setPublishType('workbook');
        if (!workbookName) {
          setWorkbookName(nameWithoutExtension);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    if (publishType === 'workbook' && !workbookName.trim()) {
      setError('Please enter a workbook name');
      return;
    }

    if (publishType === 'datasource' && !datasourceName.trim()) {
      setError('Please enter a data source name');
      return;
    }

    setIsUploading(true);
    setError(null);
    setResponse(null);
    setDatasourceResponse(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('overwrite', overwrite.toString());
      formData.append('encryptExtracts', encryptExtracts.toString());

      let endpoint = '';
      if (publishType === 'workbook') {
        formData.append('workbookName', workbookName);
        formData.append('showTabs', showTabs.toString());
        endpoint = '/api/publish-workbook';
      } else {
        formData.append('datasourceName', datasourceName);
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
                  accept=".twb,.twbx,.hyper,.tds,.tdsx"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  Supported formats: .twb, .twbx (workbooks), .hyper, .tds, .tdsx (data sources) (Max 64MB)
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
                        : 'Data sources (.hyper, .tds, .tdsx) are published to the datasources endpoint'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Name Field - Dynamic based on publish type */}
              {publishType === 'workbook' ? (
                <div>
                  <label htmlFor="workbookName" className="block text-sm font-medium text-gray-700 mb-2">
                    Workbook Name
                  </label>
                  <input
                    type="text"
                    id="workbookName"
                    value={workbookName}
                    onChange={(e) => setWorkbookName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter workbook name"
                    required
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="datasourceName" className="block text-sm font-medium text-gray-700 mb-2">
                    Data Source Name
                  </label>
                  <input
                    type="text"
                    id="datasourceName"
                    value={datasourceName}
                    onChange={(e) => setDatasourceName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter data source name"
                    required
                  />
                </div>
              )}

              {/* Project Selection */}
              <div>
                <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 mb-2">
                  Select Project
                </label>
                <select
                  id="projectId"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a project (or leave empty for default)</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.id})
                    </option>
                  ))}
                </select>
                {isLoadingProjects && (
                  <p className="mt-1 text-sm text-gray-500">Loading projects...</p>
                )}
              </div>

              {/* Options */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Options</h3>
                
                {publishType === 'workbook' && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showTabs"
                      checked={showTabs}
                      onChange={(e) => setShowTabs(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="showTabs" className="ml-2 block text-sm text-gray-900">
                      Show tabs
                    </label>
                  </div>
                )}

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="overwrite"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="overwrite" className="ml-2 block text-sm text-gray-900">
                    Overwrite existing workbook
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="encryptExtracts"
                    checked={encryptExtracts}
                    onChange={(e) => setEncryptExtracts(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="encryptExtracts" className="ml-2 block text-sm text-gray-900">
                    Encrypt extracts
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isUploading || !file}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Publishing...' : `Publish ${publishType === 'workbook' ? 'Workbook' : 'Data Source'}`}
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
                        {datasourceResponse.data.workbook?.id && (
                            <p>
                                <strong>Workbook ID:</strong> {datasourceResponse.data.workbook.id}
                            </p>
                        )}
                          {typeof datasourceResponse.data.connected === 'boolean' && (
                            <p>
                              <strong>Connected:</strong> {datasourceResponse.data.connected ? 'Yes' : 'Not verified'}
                            </p>
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

        {/* Projects Display Section */}
        <div className="mt-8 bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Available Projects</h2>
            {isLoadingProjects ? (
              <p className="text-gray-500">Loading projects...</p>
            ) : projects.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {projects.map((project) => (
                      <tr key={project.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {project.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                          {project.id}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {project.description || 'No description'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No projects found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
