/**
 * GoogleOAuthService - Servizio per l'autenticazione OAuth2 con Google
 */

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface UserInfo {
  email: string;
  verified_email: boolean;
  id: string;
}

export class GoogleOAuthService {
  private config: OAuthConfig;
  private sessionStates: Set<string> = new Set();

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  getAuthorizationUrl(scopes: string[]): string {
    const state = this.generateState();
    this.sessionStates.add(state);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      state: state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        throw new Error('Token exchange failed');
      }

      const data = await response.json();
      return data as TokenResponse;
    } catch (error) {
      throw new Error('Impossibile connettersi a Google. Riprova.');
    }
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Impossibile connettersi a Google. Riprova.');
    }

    const data = await response.json();
    return data as UserInfo;
  }

  validateState(state: string): void {
    if (!this.sessionStates.has(state)) {
      throw new Error('Impossibile connettersi a Google. Riprova.');
    }
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
