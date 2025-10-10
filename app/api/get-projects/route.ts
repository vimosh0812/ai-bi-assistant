import { NextRequest, NextResponse } from 'next/server';
import { TableauAuth, TableauCredentials } from '@/lib/tableau-auth';
import axios from 'axios';

export async function GET() {
  try {
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

    // Authenticate
    const auth = new TableauAuth(credentials);
    const authResponse = await auth.authenticate();
    const token = authResponse.credentials.token;

    // Get projects
    const projectsUrl = `${credentials.serverUrl}/api/${credentials.apiVersion}/sites/${credentials.siteId}/projects`;
    
    const response = await axios.get(projectsUrl, {
      headers: {
        'X-Tableau-Auth': token,
        'Content-Type': 'application/xml',
      },
    });

    // Parse XML response to extract projects
    let projects = [];
    if (typeof response.data === 'string') {
      // Parse XML response
      const projectMatches = response.data.match(/<project[^>]*>/g) || [];
      projects = projectMatches.map((projectTag: string) => {
        const idMatch = projectTag.match(/id="([^"]+)"/);
        const nameMatch = projectTag.match(/name="([^"]+)"/);
        const descriptionMatch = projectTag.match(/description="([^"]+)"/);
        const createdAtMatch = projectTag.match(/createdAt="([^"]+)"/);
        const updatedAtMatch = projectTag.match(/updatedAt="([^"]+)"/);

        return {
          id: idMatch ? idMatch[1] : '',
          name: nameMatch ? nameMatch[1] : '',
          description: descriptionMatch ? descriptionMatch[1] : '',
          createdAt: createdAtMatch ? createdAtMatch[1] : '',
          updatedAt: updatedAtMatch ? updatedAtMatch[1] : ''
        };
      });
    } else {
      // Response is already parsed as object
      projects = response.data.projects?.project || [];
    }

    return NextResponse.json({
      success: true,
      projects: projects
    });

  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch projects',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
