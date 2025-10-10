import { NextRequest, NextResponse } from 'next/server';
import { TableauPublisher } from '@/lib/tableau-publisher';
import { TableauCredentials } from '@/lib/tableau-auth';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const workbookName = formData.get('workbookName') as string;
    const projectId = formData.get('projectId') as string;
    const showTabs = formData.get('showTabs') === 'true';
    const overwrite = formData.get('overwrite') === 'true';
    const encryptExtracts = formData.get('encryptExtracts') === 'true';

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!workbookName) {
      return NextResponse.json(
        { error: 'Workbook name is required' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedExtensions = ['.twb', '.twbx', '.hyper'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .twb, .twbx, and .hyper files are allowed.' },
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

    // Publish workbook
    const result = await publisher.publishWorkbook({
      workbookName,
      projectId: projectId || process.env.TABLEAU_PROJECT_ID || '',
      showTabs,
      overwrite,
      encryptExtracts,
      file: fileBuffer,
      fileName: file.name,
    });

    return NextResponse.json({
      success: true,
      message: 'Workbook published successfully',
      data: result
    });

  } catch (error: any) {
    console.error('Error publishing workbook:', error);
    return NextResponse.json(
      { 
        error: 'Failed to publish workbook',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Tableau Workbook Publisher API',
    endpoints: {
      POST: '/api/publish-workbook - Upload and publish a workbook'
    }
  });
}
