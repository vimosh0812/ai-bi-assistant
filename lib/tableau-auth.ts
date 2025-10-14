import axios from 'axios';

export interface TableauCredentials {
  serverUrl: string;
  apiVersion: string;
  siteId: string;
  contentUrl: string;
  personalAccessToken: string;
  personalAccessTokenName: string;
}

export interface TableauAuthResponse {
  credentials: {
    token: string;
    site: {
      id: string;
      contentUrl: string;
    };
    user: {
      id: string;
    };
  };
}

export class TableauAuth {
  private credentials: TableauCredentials;

  constructor(credentials: TableauCredentials) {
    this.credentials = credentials;
  }

  async authenticate(): Promise<TableauAuthResponse> {
    const authUrl = `${this.credentials.serverUrl}/api/${this.credentials.apiVersion}/auth/signin`;
    
    // Use Personal Access Token authentication
    const credentials = {
      personalAccessTokenName: this.credentials.personalAccessTokenName,
      personalAccessTokenSecret: this.credentials.personalAccessToken,
      site: {
        contentUrl: this.credentials.contentUrl
      }
    };

    // Create XML request body for Personal Access Token
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<tsRequest>
  <credentials personalAccessTokenName="${credentials.personalAccessTokenName}" personalAccessTokenSecret="${credentials.personalAccessTokenSecret}">
    <site contentUrl="${credentials.site.contentUrl}" />
  </credentials>
</tsRequest>`;

    try {
      console.log('Authenticating with Tableau Server:', authUrl);
      console.log('Request body:', xmlBody);
      
      const response = await axios.post(authUrl, xmlBody, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      console.log('Authentication response:', response.data);

      // Check if response.data is already parsed (object) or needs parsing (string)
      let responseData = response.data;
      if (typeof responseData === 'string') {
        // Parse XML response to extract token
        const tokenMatch = responseData.match(/<token>([^<]+)<\/token>/);
        const siteIdMatch = responseData.match(/<site id="([^"]+)"[^>]*>/);
        const userIdMatch = responseData.match(/<user id="([^"]+)"[^>]*>/);
        const contentUrlMatch = responseData.match(/<site[^>]*contentUrl="([^"]+)"[^>]*>/);

        if (!tokenMatch || !siteIdMatch || !userIdMatch) {
          console.error('Failed to parse authentication response:', responseData);
          throw new Error('Failed to parse authentication response');
        }

        return {
          credentials: {
            token: tokenMatch[1],
            site: {
              id: siteIdMatch[1],
              contentUrl: contentUrlMatch ? contentUrlMatch[1] : ''
            },
            user: {
              id: userIdMatch[1]
            }
          }
        };
      } else {
        // Response is already parsed as object
        return {
          credentials: {
            token: responseData.credentials.token,
            site: {
              id: responseData.credentials.site.id,
              contentUrl: responseData.credentials.site.contentUrl
            },
            user: {
              id: responseData.credentials.user.id
            }
          }
        };
      }
    } catch (error: any) {
      console.error('Tableau authentication failed:', error.response?.data || error.message);
      console.error('Request URL:', authUrl);
      console.error('Request body:', xmlBody);
      throw new Error(`Authentication failed: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }
}
