/**
 * TokenManager - Gestione dei token OAuth2 e refresh automatico
 */

import { GoogleOAuthService } from './GoogleOAuthService';

interface TokenManagerConfig {
  clientId: string;
  clientSecret: string;
}

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface TokenStatus {
  isRevoked: boolean;
  revokedAt: Date | null;
}

interface ValidationResult {
  isValid: boolean;
  isRevoked: boolean;
  errorMessage: string;
}

interface ValidTokenResult {
  success: boolean;
  error: string | null;
  token: string | null;
}

export class TokenManager {
  private config: TokenManagerConfig;
  private currentToken: StoredToken | null = null;
  private readonly REFRESH_THRESHOLD = 600000; // 10 minuti in millisecondi
  private tokens: Map<string, StoredToken> = new Map();
  private revokedTokens: Map<string, Date> = new Map();

  constructor(config: TokenManagerConfig | GoogleOAuthService) {
    if ('clientId' in config && 'clientSecret' in config) {
      this.config = config as TokenManagerConfig;
    } else {
      this.config = { clientId: '', clientSecret: '' };
    }
  }

  isTokenExpired(token: StoredToken): boolean {
    return token.expires_at < Date.now();
  }

  processToken(token: TokenResponse): StoredToken {
    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token || '',
      expires_in: token.expires_in,
      expires_at: Date.now() + token.expires_in * 1000,
      token_type: token.token_type,
    };
  }

  needsRefresh(token: StoredToken): boolean {
    const timeUntilExpiry = token.expires_at - Date.now();
    return timeUntilExpiry < this.REFRESH_THRESHOLD;
  }

  async refreshAccessToken(userIdOrToken: string): Promise<TokenResponse> {
    // Se Ã¨ un userId, recupera il token
    let refreshToken: string;
    let userId: string | null = null;
    
    if (this.tokens.has(userIdOrToken)) {
      userId = userIdOrToken;
      const storedToken = this.tokens.get(userIdOrToken);
      if (!storedToken) {
        throw new Error('No token found');
      }
      
      // Controlla se Ã¨ giÃ  revocato
      if (this.revokedTokens.has(userId)) {
        throw new Error('Accesso revocato. Riconnetti il tuo account Google.');
      }
      
      refreshToken = storedToken.refresh_token;
    } else {
      refreshToken = userIdOrToken;
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        // Prima controlla errori HTTP specifici
        if (response.status === 500) {
          throw new Error('Errore del server Google');
        }
        
        // Prova a parsare il JSON solo se non Ã¨ un errore 500
        let data: { error?: string } = {};
        try {
          data = await response.json() as { error?: string };
        } catch {
          // Se non Ã¨ JSON valido, continua con i controlli di status
        }
        
        // Controlla se Ã¨ un errore di revoca
        if (data.error === 'invalid_grant') {
          if (userId) {
            this.revokedTokens.set(userId, new Date());
          }
          throw new Error('Accesso revocato. Riconnetti il tuo account Google.');
        }
        
        const isRevoked = response.status === 400 || response.status === 401;
        if (isRevoked) {
          throw new Error('Sessione scaduta. Effettua nuovamente il login.');
        }
        throw new Error('Token refresh failed');
      }

      const data = await response.json() as TokenResponse;
      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Accesso revocato')) {
          throw error;
        }
        if (error.message.includes('Sessione scaduta')) {
          throw error;
        }
        if (error.message.includes('Errore del server Google')) {
          throw error;
        }
        if (error.message === 'Network timeout') {
          throw new Error('Errore di rete');
        }
      }
      throw new Error('Impossibile rinnovare la sessione. Riprova.');
    }
  }

  async saveTokens(userIdOrToken: string | StoredToken, tokens?: TokenResponse): Promise<void> {
    if (typeof userIdOrToken === 'string' && tokens) {
      // Nuovo formato: saveTokens(userId, tokens)
      const userId = userIdOrToken;
      const storedToken = this.processToken(tokens);
      this.tokens.set(userId, storedToken);
      
      // Se salviamo nuovi token, rimuoviamo lo stato di revoca
      if (this.revokedTokens.has(userId)) {
        this.revokedTokens.delete(userId);
      }
    } else {
      // Vecchio formato: saveTokens(token)
      this.currentToken = userIdOrToken as StoredToken;
    }
  }

  async getValidAccessToken(): Promise<string>;
  async getValidAccessToken(userId: string): Promise<ValidTokenResult>;
  async getValidAccessToken(userId?: string): Promise<string | ValidTokenResult> {
    if (userId) {
      // Controlla se Ã¨ revocato
      if (this.revokedTokens.has(userId)) {
        return {
          success: false,
          error: 'Accesso revocato. Riconnetti il tuo account Google.',
          token: null,
        };
      }
      
      const token = this.tokens.get(userId);
      if (!token) {
        return {
          success: false,
          error: 'No token available',
          token: null,
        };
      }
      
      return {
        success: true,
        error: null,
        token: token.access_token,
      };
    }
    
    // Vecchio comportamento
    if (!this.currentToken) {
      throw new Error('No token available');
    }

    if (this.isTokenExpired(this.currentToken) || this.needsRefresh(this.currentToken)) {
      const newTokens = await this.refreshAccessToken(this.currentToken.refresh_token);
      const processedToken = this.processToken(newTokens);
      
      // Mantieni il refresh token originale se Google non ne invia uno nuovo
      if (!newTokens.refresh_token) {
        processedToken.refresh_token = this.currentToken.refresh_token;
      }
      
      this.currentToken = processedToken;
    }

    return this.currentToken.access_token;
  }

  async validateAccessToken(_accessToken: string): Promise<ValidationResult> {
    // Simula validazione - ritorna revocato per token non autorizzati
    return {
      isValid: false,
      isRevoked: true,
      errorMessage: 'Accesso revocato. Riconnetti il tuo account Google.',
    };
  }

  async getTokenStatus(userId: string): Promise<TokenStatus> {
    const isRevoked = this.revokedTokens.has(userId);
    return {
      isRevoked,
      revokedAt: isRevoked ? this.revokedTokens.get(userId)! : null,
    };
  }

  async markAsRevoked(userId: string): Promise<void> {
    this.revokedTokens.set(userId, new Date());
  }

  async isAccessRevoked(userId: string): Promise<boolean> {
    return this.revokedTokens.has(userId);
  }
}
