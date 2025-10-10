import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { TableauPublisher } from '@/lib/tableau-publisher';
import { TableauCredentials } from '@/lib/tableau-auth';

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
    const allowedExtensions = ['.hyper', '.tds', '.tdsx'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .hyper, .tds, and .tdsx files are allowed for data sources.' },
        { status: 400 }
      );
    }

    // Check file size (64MB limit)
    const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || '64') * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds ${process.env.MAX_FILE_SIZE_MB || '64'}MB limit` },
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
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Create publisher instance
    const publisher = new TableauPublisher(credentials);

    // Publish data source
    const result = await publisher.publishDataSource({
      datasourceName,
      projectId: projectId || process.env.TABLEAU_PROJECT_ID || '',
      overwrite,
      encryptExtracts,
      file: fileBuffer,
      fileName: file.name,
    });

    // After datasource publish, publish the template workbook (data/new-ds.twb),
    // replacing occurrences of the placeholder datasource name with the new one
    let workbookResult: any | null = null;
    try {
      const templatePath = path.join(process.cwd(), 'data', 'new-ds.twb');
      let twbXml = fs.readFileSync(templatePath, 'utf8');
      if (datasourceName) {
        // Replace all standalone occurrences of 'dandan003' with the new datasource name
        // This covers caption, dbname, server-ds-friendly-name, and derived-from URL segment
        const pattern = /\bdandan003\b/g;
        twbXml = twbXml.replace(pattern, datasourceName);
      }
      const modifiedBuffer = Buffer.from(twbXml, 'utf8');

      workbookResult = await publisher.publishWorkbook({
        workbookName: `${datasourceName} - Workbook`,
        projectId: projectId || process.env.TABLEAU_PROJECT_ID || '',
        showTabs: true,
        overwrite,
        encryptExtracts,
        file: modifiedBuffer,
        fileName: 'new-ds.twb',
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
        workbook: workbookResult?.workbook || null
      },
      datasourceUrl: result.datasource.webpageUrl,
      workbookUrl: workbookUrl,
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
