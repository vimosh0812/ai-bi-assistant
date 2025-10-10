import axios from 'axios';
import { TableauAuth, TableauCredentials } from './tableau-auth';

export interface PublishWorkbookRequest {
  workbookName: string;
  projectId: string;
  showTabs: boolean;
  overwrite: boolean;
  encryptExtracts: boolean;
  file: Buffer;
  fileName: string;
}

export interface PublishDataSourceRequest {
  datasourceName: string;
  projectId: string;
  overwrite: boolean;
  encryptExtracts: boolean;
  file: Buffer;
  fileName: string;
}

export interface PublishWorkbookResponse {
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
}

export interface PublishDataSourceResponse {
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
    views: Array<{
      id: string;
      name: string;
      contentUrl: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
}

export class TableauPublisher {
  private auth: TableauAuth;
  private serverUrl: string;
  private apiVersion: string;
  private siteId: string;

  constructor(credentials: TableauCredentials) {
    this.auth = new TableauAuth(credentials);
    this.serverUrl = credentials.serverUrl;
    this.apiVersion = credentials.apiVersion;
    this.serverUrl = credentials.serverUrl;
    this.siteId = credentials.siteId;
  }

  
  async publishWorkbook(request: PublishWorkbookRequest): Promise<PublishWorkbookResponse> {
    // First authenticate
    const authResponse = await this.auth.authenticate();
    const token = authResponse.credentials.token;

    // Prepare the XML request payload
    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<tsRequest>
  <workbook name="${request.workbookName}" showTabs="${request.showTabs}" encryptExtracts="${request.encryptExtracts}">
    <project id="${request.projectId}"/>
  </workbook>
</tsRequest>`;

    // Create multipart request manually
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const CRLF = '\r\n';
    
    let body = '';
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="request_payload"${CRLF}`;
    body += `Content-Type: text/xml${CRLF}${CRLF}`;
    body += xmlPayload;
    body += `${CRLF}--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="tableau_workbook"; filename="${request.fileName}"${CRLF}`;
    body += `Content-Type: application/octet-stream${CRLF}${CRLF}`;
    
    const bodyBuffer = Buffer.concat([
      Buffer.from(body, 'utf8'),
      request.file,
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
    ]);

    const publishUrl = `${this.serverUrl}/api/${this.apiVersion}/sites/${this.siteId}/workbooks`;

    try {
      const response = await axios.post(publishUrl, bodyBuffer, {
        headers: {
          'X-Tableau-Auth': token,
          'Content-Type': `multipart/mixed; boundary=${boundary}`
        },
        params: {
          overwrite: request.overwrite.toString()
        },
        responseType: 'text' // Ensure response is treated as text, not JSON
      });

      // Parse response - handle both JSON and XML responses
      let responseData;
      
      if (typeof response.data === 'string') {
        try {
          // Try to parse as JSON first
          responseData = JSON.parse(response.data);
        } catch {
          // If not JSON, treat as XML
          responseData = response.data;
        }
      } else {
        responseData = response.data;
      }

      // Handle JSON response (success case)
      if (typeof responseData === 'object' && responseData !== null && responseData.workbook) {
        const workbook = responseData.workbook;
        
        console.log('Workbook response structure:', {
          workbook: workbook,
          viewsType: typeof workbook.views,
          viewsIsArray: Array.isArray(workbook.views),
          viewsValue: workbook.views
        });
        
        // Extract views from JSON response
        const views = (workbook.views && Array.isArray(workbook.views)) 
          ? workbook.views.map((view: any) => ({
              id: view.id || '',
              name: view.name || '',
              contentUrl: view.contentUrl || '',
              createdAt: view.createdAt || '',
              updatedAt: view.updatedAt || ''
            }))
          : [];

        return {
          workbook: {
            id: workbook.id || '',
            name: workbook.name || request.workbookName,
            contentUrl: workbook.contentUrl || '',
            webpageUrl: workbook.webpageUrl || '',
            showTabs: workbook.showTabs || request.showTabs,
            size: workbook.size || 0,
            createdAt: workbook.createdAt || new Date().toISOString(),
            updatedAt: workbook.updatedAt || new Date().toISOString(),
            encryptExtracts: workbook.encryptExtracts === 'true' || request.encryptExtracts,
            project: {
              id: workbook.project?.id || request.projectId,
              name: workbook.project?.name || ''
            },
            owner: {
              id: workbook.owner?.id || ''
            },
            views
          }
        };
      }

      // Handle XML response (fallback)
      if (typeof responseData === 'string' && responseData.includes('<workbook')) {
        const workbookIdMatch = responseData.match(/<workbook id="([^"]+)"[^>]*>/);
        const workbookNameMatch = responseData.match(/<workbook[^>]*name="([^"]+)"[^>]*>/);
        const contentUrlMatch = responseData.match(/<workbook[^>]*contentUrl="([^"]+)"[^>]*>/);
        const webpageUrlMatch = responseData.match(/<workbook[^>]*webpageUrl="([^"]+)"[^>]*>/);
        const showTabsMatch = responseData.match(/<workbook[^>]*showTabs="([^"]+)"[^>]*>/);
        const sizeMatch = responseData.match(/<workbook[^>]*size="([^"]+)"[^>]*>/);
        const createdAtMatch = responseData.match(/<workbook[^>]*createdAt="([^"]+)"[^>]*>/);
        const updatedAtMatch = responseData.match(/<workbook[^>]*updatedAt="([^"]+)"[^>]*>/);
        const encryptExtractsMatch = responseData.match(/<workbook[^>]*encryptExtracts="([^"]+)"[^>]*>/);

        const projectIdMatch = responseData.match(/<project id="([^"]+)"[^>]*>/);
        const projectNameMatch = responseData.match(/<project[^>]*name="([^"]+)"[^>]*>/);
        const ownerIdMatch = responseData.match(/<owner id="([^"]+)"[^>]*>/);

        if (!workbookIdMatch) {
          throw new Error('Failed to parse workbook response');
        }

        // Extract views
        const viewMatches = responseData.match(/<view[^>]*>/g) || [];
        const views = viewMatches.map((viewTag: string) => {
          const viewIdMatch = viewTag.match(/id="([^"]+)"/);
          const viewNameMatch = viewTag.match(/name="([^"]+)"/);
          const viewContentUrlMatch = viewTag.match(/contentUrl="([^"]+)"/);
          const viewCreatedAtMatch = viewTag.match(/createdAt="([^"]+)"/);
          const viewUpdatedAtMatch = viewTag.match(/updatedAt="([^"]+)"/);

          return {
            id: viewIdMatch ? viewIdMatch[1] : '',
            name: viewNameMatch ? viewNameMatch[1] : '',
            contentUrl: viewContentUrlMatch ? viewContentUrlMatch[1] : '',
            createdAt: viewCreatedAtMatch ? viewCreatedAtMatch[1] : '',
            updatedAt: viewUpdatedAtMatch ? viewUpdatedAtMatch[1] : ''
          };
        });

        return {
          workbook: {
            id: workbookIdMatch[1],
            name: workbookNameMatch ? workbookNameMatch[1] : request.workbookName,
            contentUrl: contentUrlMatch ? contentUrlMatch[1] : '',
            webpageUrl: webpageUrlMatch ? webpageUrlMatch[1] : '',
            showTabs: showTabsMatch ? showTabsMatch[1] === 'true' : request.showTabs,
            size: sizeMatch ? parseInt(sizeMatch[1]) : 0,
            createdAt: createdAtMatch ? createdAtMatch[1] : new Date().toISOString(),
            updatedAt: updatedAtMatch ? updatedAtMatch[1] : new Date().toISOString(),
            encryptExtracts: encryptExtractsMatch ? encryptExtractsMatch[1] === 'true' : request.encryptExtracts,
            project: {
              id: projectIdMatch ? projectIdMatch[1] : request.projectId,
              name: projectNameMatch ? projectNameMatch[1] : ''
            },
            owner: {
              id: ownerIdMatch ? ownerIdMatch[1] : ''
            },
            views
          }
        };
      }

      // Handle error response
      if (typeof responseData === 'object' && responseData !== null) {
        const errorMessage = responseData.error?.message || responseData.message || 'Unknown error from Tableau server';
        throw new Error(`Tableau API error: ${errorMessage}`);
      }

      throw new Error('Invalid response from Tableau server');
    } catch (error: any) {
      console.error('Tableau workbook publishing failed:', error.response?.data || error.message);
      throw new Error(`Workbook publishing failed: ${error.response?.data || error.message}`);
    }
  }

  async publishDataSource(request: PublishDataSourceRequest): Promise<PublishDataSourceResponse> {
    // First authenticate
    const authResponse = await this.auth.authenticate();
    const token = authResponse.credentials.token;

    // Prepare the XML request payload for data source
    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<tsRequest>
  <datasource name="${request.datasourceName}" encryptExtracts="${request.encryptExtracts}">
    <project id="${request.projectId}"/>
  </datasource>
</tsRequest>`;

    // Create multipart request manually
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const CRLF = '\r\n';
    
    let body = '';
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="request_payload"${CRLF}`;
    body += `Content-Type: text/xml${CRLF}${CRLF}`;
    body += xmlPayload;
    body += `${CRLF}--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="tableau_datasource"; filename="${request.fileName}"${CRLF}`;
    body += `Content-Type: application/octet-stream${CRLF}${CRLF}`;
    
    const bodyBuffer = Buffer.concat([
      Buffer.from(body, 'utf8'),
      request.file,
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
    ]);

    const publishUrl = `${this.serverUrl}/api/${this.apiVersion}/sites/${this.siteId}/datasources`;

    try {
      const response = await axios.post(publishUrl, bodyBuffer, {
        headers: {
          'X-Tableau-Auth': token,
          'Content-Type': `multipart/mixed; boundary=${boundary}`
        },
        params: {
          overwrite: request.overwrite.toString()
        },
        responseType: 'text' // Ensure response is treated as text, not JSON
      });

      // Parse response - handle both JSON and XML responses
      let responseData;
      
      if (typeof response.data === 'string') {
        try {
          // Try to parse as JSON first
          responseData = JSON.parse(response.data);
        } catch {
          // If not JSON, treat as XML
          responseData = response.data;
        }
      } else {
        responseData = response.data;
      }

      // Handle JSON response (success case)
      if (typeof responseData === 'object' && responseData !== null && responseData.datasource) {
        const datasource = responseData.datasource;
        
        const datasourceResult = {
          datasource: {
            id: datasource.id || '',
            name: datasource.name || request.datasourceName,
            contentUrl: datasource.contentUrl || '',
            webpageUrl: datasource.webpageUrl || '',
            size: datasource.size || 0,
            createdAt: datasource.createdAt || new Date().toISOString(),
            updatedAt: datasource.updatedAt || new Date().toISOString(),
            encryptExtracts: datasource.encryptExtracts === 'true' || request.encryptExtracts,
            project: {
              id: datasource.project?.id || request.projectId,
              name: datasource.project?.name || ''
            },
            owner: {
              id: datasource.owner?.id || ''
            }
          }
        };

        // Note: Tableau REST API doesn't support creating empty workbooks
        // Users need to create workbooks in Tableau Desktop and connect to the datasource
        console.log('Datasource published successfully:', {
          datasourceId: datasource.id,
          projectId: datasource.project?.id || request.projectId,
          datasourceName: request.datasourceName,
          datasourceUrl: datasource.webpageUrl
        });
        
        return datasourceResult;
      }

      // Handle XML response (fallback)
      if (typeof responseData === 'string' && responseData.includes('<datasource')) {
        const datasourceIdMatch = responseData.match(/<datasource id="([^"]+)"[^>]*>/);
        const datasourceNameMatch = responseData.match(/<datasource[^>]*name="([^"]+)"[^>]*>/);
        const contentUrlMatch = responseData.match(/<datasource[^>]*contentUrl="([^"]+)"[^>]*>/);
        const webpageUrlMatch = responseData.match(/<datasource[^>]*webpageUrl="([^"]+)"[^>]*>/);
        const sizeMatch = responseData.match(/<datasource[^>]*size="([^"]+)"[^>]*>/);
        const createdAtMatch = responseData.match(/<datasource[^>]*createdAt="([^"]+)"[^>]*>/);
        const updatedAtMatch = responseData.match(/<datasource[^>]*updatedAt="([^"]+)"[^>]*>/);
        const encryptExtractsMatch = responseData.match(/<datasource[^>]*encryptExtracts="([^"]+)"[^>]*>/);

        const projectIdMatch = responseData.match(/<project id="([^"]+)"[^>]*>/);
        const projectNameMatch = responseData.match(/<project[^>]*name="([^"]+)"[^>]*>/);
        const ownerIdMatch = responseData.match(/<owner id="([^"]+)"[^>]*>/);

        if (!datasourceIdMatch) {
          throw new Error('Failed to parse datasource response');
        }

        const datasourceResult = {
          datasource: {
            id: datasourceIdMatch[1],
            name: datasourceNameMatch ? datasourceNameMatch[1] : request.datasourceName,
            contentUrl: contentUrlMatch ? contentUrlMatch[1] : '',
            webpageUrl: webpageUrlMatch ? webpageUrlMatch[1] : '',
            size: sizeMatch ? parseInt(sizeMatch[1]) : 0,
            createdAt: createdAtMatch ? createdAtMatch[1] : new Date().toISOString(),
            updatedAt: updatedAtMatch ? updatedAtMatch[1] : new Date().toISOString(),
            encryptExtracts: encryptExtractsMatch ? encryptExtractsMatch[1] === 'true' : request.encryptExtracts,
            project: {
              id: projectIdMatch ? projectIdMatch[1] : request.projectId,
              name: projectNameMatch ? projectNameMatch[1] : ''
            },
            owner: {
              id: ownerIdMatch ? ownerIdMatch[1] : ''
            }
          }
        };

        // Note: Tableau REST API doesn't support creating empty workbooks
        // Users need to create workbooks in Tableau Desktop and connect to the datasource
        console.log('Datasource published successfully (XML):', {
          datasourceId: datasourceIdMatch[1],
          projectId: projectIdMatch ? projectIdMatch[1] : request.projectId,
          datasourceName: request.datasourceName
        });
        
        return datasourceResult;
      }

      // Handle error response
      if (typeof responseData === 'object' && responseData !== null) {
        const errorMessage = responseData.error?.message || responseData.message || 'Unknown error from Tableau server';
        throw new Error(`Tableau API error: ${errorMessage}`);
      }

      throw new Error('Invalid response from Tableau server');
    } catch (error: any) {
      console.error('Tableau datasource publishing failed:', error.response?.data || error.message);
      throw new Error(`Datasource publishing failed: ${error.response?.data || error.message}`);
    }
  }

}
