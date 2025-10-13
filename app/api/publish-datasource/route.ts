import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TableauPublisher } from '@/lib/tableau-publisher';
import { TableauCredentials } from '@/lib/tableau-auth';
import { DEFAULT_NAMES, FILE_PATTERNS, TABLEAU_SETTINGS, ALLOWED_EXTENSIONS } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const datasourceName = formData.get('datasourceName') as string;
    const projectId = formData.get('projectId') as string;
    const overwrite = formData.get('overwrite') === 'true';
    const encryptExtracts = formData.get('encryptExtracts') === 'true';

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

    // Create a new project with random UUID
    const projectUuid = uuidv4();
    const projectName = `CSV Upload - ${projectUuid}`;
    
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

    // After datasource publish, publish the template workbook,
    // replacing occurrences of the placeholder datasource name with the new one
    let workbookResult: any | null = null;
    try {
      const templatePath = path.join(process.cwd(), FILE_PATTERNS.TEMPLATE_WORKBOOK_PATH);
      let twbXml = fs.readFileSync(templatePath, 'utf8');
      if (datasourceName) {
        // Replace all standalone occurrences of the template datasource name with the new one
        // This covers caption, dbname, server-ds-friendly-name, and derived-from URL segment
        const pattern = new RegExp(`\\b${DEFAULT_NAMES.TEMPLATE_DATASOURCE_NAME}\\b`, 'g');
        twbXml = twbXml.replace(pattern, datasourceName);
      }
      const modifiedBuffer = Buffer.from(twbXml, 'utf8');

      workbookResult = await publisher.publishWorkbook({
        workbookName: datasourceName,
        projectId: projectResult.project!.id,
        showTabs: TABLEAU_SETTINGS.DEFAULT_SHOW_TABS,
        overwrite,
        encryptExtracts,
        file: modifiedBuffer,
        fileName: FILE_PATTERNS.TEMPLATE_WORKBOOK_FILENAME,
      });
    } catch (workbookErr: any) {
      console.error('Failed to publish template workbook:', workbookErr?.response?.data || workbookErr?.message || workbookErr);
    }

    const workbookUrl: string | null = workbookResult?.workbook?.webpageUrl || null;

    return NextResponse.json({
      success: true,
      message: workbookResult ? 'Data source and workbook published successfully' : 'Data source published successfully',
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
