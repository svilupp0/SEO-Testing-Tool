/**
 * Environment Configuration
 * Carica le credenziali Google OAuth2 in modo sicuro da .env
 */

import { readFileSync, readdirSync } from 'fs';
import path from 'path';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUri: string;
  tokenUri: string;
  scopes: string[];
}

/**
 * Carica configurazione Google OAuth2 dalle variabili d'ambiente
 *
 * @throws Error se le credenziali non sono configurate
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost';
  const authUri = process.env.GOOGLE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth';
  const tokenUri = process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token';
  const scopesStr = process.env.GOOGLE_SCOPES ||
    'https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/userinfo.email';

  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth credentials not configured. ' +
      'Please create a .env file with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. ' +
      'See .env.example for reference.'
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    authUri,
    tokenUri,
    scopes: scopesStr.split(',').map(s => s.trim()),
  };
}

/**
 * Carica configurazione da file client_secret_*.json (fallback)
 * ATTENZIONE: Usare solo per test locali, non in produzione!
 *
 * @param filePath Percorso al file client_secret JSON
 */
export function loadCredentialsFromFile(filePath: string): GoogleOAuthConfig {
  const content = readFileSync(filePath, 'utf-8');
  const credentials = JSON.parse(content);

  // Il file può avere formato "installed" o "web"
  const creds = credentials.installed || credentials.web;

  if (!creds) {
    throw new Error('Invalid client_secret file format');
  }

  return {
    clientId: creds.client_id,
    clientSecret: creds.client_secret,
    redirectUri: creds.redirect_uris[0],
    authUri: creds.auth_uri,
    tokenUri: creds.token_uri,
    scopes: [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  };
}

/**
 * Helper per test: carica credenziali da .env o file
 */
export function getTestCredentials(): GoogleOAuthConfig {
  try {
    return getGoogleOAuthConfig();
  } catch {
    // Fallback: prova a caricare dal file client_secret
    const files = readdirSync(process.cwd());
    const secretFile = files.find((f: string) => f.startsWith('client_secret_') && f.endsWith('.json'));

    if (secretFile) {
      return loadCredentialsFromFile(path.join(process.cwd(), secretFile));
    }

    throw new Error('No credentials found. Configure .env or add client_secret file.');
  }
}
