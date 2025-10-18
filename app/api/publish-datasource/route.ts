import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TableauPublisher } from '@/lib/tableau-publisher';
import { TableauCredentials } from '@/lib/tableau-auth';
import { DEFAULT_NAMES, FILE_PATTERNS, TABLEAU_SETTINGS, ALLOWED_EXTENSIONS } from '@/lib/config';
import { 
  generateProjectUUID, 
  generateDatasourceName, 
  generateExtractObjectId,
  generateObjectId 
} from '@/lib/uuid-utils';


export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userDatasourceName = formData.get('datasourceName') as string;
    const projectId = formData.get('projectId') as string;
    const overwrite = formData.get('overwrite') === 'true';
    const encryptExtracts = formData.get('encryptExtracts') === 'true';

    // Generate unique datasource name with UUID
    const datasourceName = userDatasourceName 
      ? generateDatasourceName(userDatasourceName)
      : generateDatasourceName(DEFAULT_NAMES.DATA_SOURCE_NAME);

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!datasourceName) {
      return NextResponse.json(
        { error: 'Data source name is required' },
        { status: 400 }
      );
    }

    // Validate file type for data sources
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.')) as '.hyper' | '.tds' | '.tdsx' | '.csv';
    
    if (!ALLOWED_EXTENSIONS.DATASOURCE.includes(fileExtension)) {
      return NextResponse.json(
        { error: `Invalid file type. Only ${ALLOWED_EXTENSIONS.DATASOURCE.join(', ')} files are allowed for data sources.` },
        { status: 400 }
      );
    }

    // Check file size limit
    const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || TABLEAU_SETTINGS.MAX_FILE_SIZE_MB.toString()) * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds ${process.env.MAX_FILE_SIZE_MB || TABLEAU_SETTINGS.MAX_FILE_SIZE_MB}MB limit` },
        { status: 400 }
      );
    }

    // Get Tableau credentials from environment variables
    const credentials: TableauCredentials = {
      serverUrl: process.env.TABLEAU_SERVER_URL!,
      apiVersion: process.env.TABLEAU_API_VERSION!,
      siteId: process.env.TABLEAU_SITE_ID!,
      contentUrl: process.env.TABLEAU_CONTENT_URL!,
      personalAccessToken: process.env.TABLEAU_PERSONAL_ACCESS_TOKEN!,
      personalAccessTokenName: process.env.TABLEAU_PERSONAL_ACCESS_TOKEN_NAME!,
    };

    // Validate required environment variables
    if (!credentials.serverUrl || !credentials.apiVersion || !credentials.siteId || 
        !credentials.contentUrl || !credentials.personalAccessToken || !credentials.personalAccessTokenName) {
      return NextResponse.json(
        { error: 'Missing required Tableau configuration. Please check your environment variables.' },
        { status: 500 }
      );
    }

    // Convert file to buffer
    let fileBuffer = Buffer.from(await file.arrayBuffer());
    let finalFileName = file.name;

    // Handle CSV files - convert to Hyper using microservice
    if (fileExtension === '.csv') {
      try {
        console.log('Converting CSV to Hyper format using microservice...');
        
        const csvHyperServiceUrl = process.env.CSV_HYPER_SERVICE_URL || process.env.NEXT_PUBLIC_CSV_HYPER_SERVICE_URL || 'http://localhost:8000';
        
        console.log(`Attempting to connect to CSV to Hyper service at: ${csvHyperServiceUrl}`);
        
        // First check if microservice is available
        try {
          const healthResponse = await fetch(`${csvHyperServiceUrl}/health`, {
            method: 'GET',
          });
          
          if (!healthResponse.ok) {
            throw new Error(`Microservice health check failed: ${healthResponse.status}`);
          }
        } catch (healthError: any) {
          console.error('Microservice health check failed:', healthError);
          return NextResponse.json(
            { 
              error: 'CSV to Hyper conversion service is not available. Please ensure the microservice is running.',
              details: `Failed to connect to ${csvHyperServiceUrl}. Error: ${healthError.message}`,
              suggestion: 'Start the microservice with: cd csv-hyper-service && python app.py'
            },
            { status: 503 }
          );
        }
        
        // Create form data for the microservice
        const formData = new FormData();
        formData.append('file', file);
        formData.append('table_name', 'Extract');

        // Call the microservice with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const conversionResponse = await fetch(`${csvHyperServiceUrl}/convert`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!conversionResponse.ok) {
          const errorText = await conversionResponse.text();
          throw new Error(`Microservice returned error: ${conversionResponse.status} - ${errorText}`);
        }

        // Get the converted Hyper file
        const hyperBuffer = await conversionResponse.arrayBuffer();
        fileBuffer = Buffer.from(hyperBuffer);
        finalFileName = path.parse(file.name).name + '.hyper';
        
        const rowCount = conversionResponse.headers.get('X-Row-Count');
        console.log(`CSV converted to Hyper successfully. ${rowCount || 0} rows processed.`);
        
      } catch (error: any) {
        console.error('CSV to Hyper conversion error:', error);
        
        let errorMessage = 'CSV conversion failed';
        let statusCode = 500;
        
        if (error.name === 'AbortError') {
          errorMessage = 'CSV conversion timed out. The file may be too large.';
          statusCode = 408;
        } else if (error.message.includes('fetch failed')) {
          errorMessage = 'CSV to Hyper conversion service is not available. Please ensure the microservice is running.';
          statusCode = 503;
        } else if (error.message.includes('Microservice returned error')) {
          errorMessage = `CSV conversion failed: ${error.message}`;
          statusCode = 502;
        } else {
          errorMessage = `CSV conversion failed: ${error.message}`;
        }
        
        return NextResponse.json(
          { 
            error: errorMessage,
            details: error.message,
            suggestion: statusCode === 503 ? 'Start the microservice with: cd csv-hyper-service && python app.py' : undefined
          },
          { status: statusCode }
        );
      }
    }

    // Create publisher instance
    const publisher = new TableauPublisher(credentials);

    // Create a new project with UUID
    const projectUuid = generateProjectUUID();
    const projectName = `Data Upload - ${projectUuid}`;
    
    console.log(`Creating new project: ${projectName}`);
    
    // Create the project first
    const projectResult = await publisher.createProject({
      name: projectName,
      description: `Auto-generated project for CSV upload: ${datasourceName}`,
    });

    if (!projectResult.success) {
      return NextResponse.json(
        { error: `Failed to create project: ${projectResult.message}` },
        { status: 500 }
      );
    }

    console.log(`Project created successfully: ${projectResult.project?.name} (ID: ${projectResult.project?.id})`);

    // Publish data source to the new project
    const result = await publisher.publishDataSource({
      datasourceName,
      projectId: projectResult.project!.id,
      overwrite,
      encryptExtracts,
      file: fileBuffer,
      fileName: finalFileName,
    });

    // After datasource publish, generate a workbook XML with datasource connection
    let workbookResult: any | null = null;
    try {
      // Generate UUIDs for workbook XML template
      const extractObjectId = generateExtractObjectId();
      const datasourceObjectId = generateObjectId();
      
      // Generate workbook XML with proper datasource connection
      const workbookXml = `<?xml version='1.0' encoding='utf-8' ?>
<workbook original-version='18.1' source-build='2025.2.0 (20252.25.0806.2353)' version='18.1' xml:base='${credentials.serverUrl}' xmlns:user='http://www.tableausoftware.com/xml/user'>
  <document-format-change-manifest>
    <AnimationOnByDefault />
    <ISO8601DefaultCalendarPref />
    <MarkAnimation />
    <ObjectModelEncapsulateLegacy />
    <ObjectModelTableType />
    <SchemaViewerObjectModel />
    <SheetIdentifierTracking />
    <WindowsPersistSimpleIdentifiers />
  </document-format-change-manifest>
  <preferences />
  <datasources>
    <datasource caption='${datasourceName}' inline='true' name='sqlproxy.0wmio8c04lwzxg1079xic0nmuz3e' version='18.1'>
      <repository-location derived-from='http://localhost:9100/t/vimosh01-5eef3e46e5/datasources/${datasourceName}?rev=1.0' id='${datasourceName}' path='/t/vimosh01-5eef3e46e5/datasources' revision='1.1' site='vimosh01-5eef3e46e5' />
      <connection channel='https' class='sqlproxy' dbname='${datasourceName}' directory='dataserver' port='443' server='prod-in-a.online.tableau.com' server-ds-friendly-name='${datasourceName}' username=''>
        <relation connection='sqlproxy.0wmio8c04lwzxg1079xic0nmuz3e' name='sqlproxy' table='[sqlproxy]' type='table' />
      </connection>
      <aliases enabled='yes' />
    </datasource>
  </datasources>
  <worksheets>
    <worksheet name='Sheet 1'>
      <table>
        <view>
          <datasources />
          <aggregation value='true' />
        </view>
        <style />
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view>
              <breakdown value='auto' />
            </view>
            <mark class='Automatic' />
          </pane>
        </panes>
        <rows />
        <cols />
      </table>
    </worksheet>
  </worksheets>
  <windows>
    <window class='worksheet' maximized='true' name='Sheet 1'>
      <cards>
        <edge name='left'>
          <strip size='160'>
            <card type='pages' />
            <card type='filters' />
            <card type='marks' />
          </strip>
        </edge>
        <edge name='top'>
          <strip size='31'>
            <card type='columns' />
          </strip>
          <strip size='31'>
            <card type='rows' />
          </strip>
          <strip size='31'>
            <card type='title' />
          </strip>
        </edge>
      </cards>
    </window>
  </windows>
</workbook>`;

console.log(workbookXml);

      const modifiedBuffer = Buffer.from(workbookXml, 'utf8');

      // Generate unique workbook name with UUID
      const workbookName = generateDatasourceName(datasourceName);
      
      workbookResult = await publisher.publishWorkbook({
        workbookName: workbookName,
        projectId: projectResult.project!.id,
        showTabs: TABLEAU_SETTINGS.DEFAULT_SHOW_TABS,
        overwrite,
        encryptExtracts,
        file: modifiedBuffer,
        fileName: FILE_PATTERNS.GENERATED_WORKBOOK_FILENAME,
      });
      
      console.log(`Generated and published workbook XML with datasource connection to '${datasourceName}'`);
      console.log(`Datasource ID: ${result.datasource.id}`);
    } catch (workbookErr: any) {
      console.error('Failed to publish generated workbook:', workbookErr?.response?.data || workbookErr?.message || workbookErr);
    }

    const workbookUrl: string | null = workbookResult?.workbook?.webpageUrl || null;

    return NextResponse.json({
      success: true,
      message: workbookResult ? 'Data source and workbook published successfully with datasource connection.' : 'Data source published successfully',
      data: {
        datasource: result.datasource,
        workbook: workbookResult?.workbook || null,
        project: {
          id: projectResult.project!.id,
          name: projectResult.project!.name,
          description: projectResult.project!.description
        }
      },
      datasourceUrl: result.datasource.webpageUrl,
      workbookUrl: workbookUrl,
      projectName: projectResult.project!.name,
    });

  } catch (error: any) {
    console.error('Error publishing data source:', error);
    return NextResponse.json(
      { 
        error: 'Failed to publish data source',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Tableau Data Source Publisher API',
    endpoints: {
      POST: '/api/publish-datasource - Upload and publish a data source'
    }
  });
}
