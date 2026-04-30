/**
 * Mock per Google OAuth2 API
 *
 * Questo modulo fornisce mock per le chiamate API Google OAuth,
 * permettendo di testare il flusso di autenticazione senza chiamate reali.
 */

import { vi } from 'vitest';

// Mock data realistici
export const MOCK_TOKENS = {
  access_token: 'ya29.a0AfH6SMBxFakeAccessToken123456789',
  refresh_token: '1//0gHcKpFakeRefreshToken987654321',
  expires_in: 3600,
  token_type: 'Bearer',
};

export const MOCK_REFRESHED_TOKENS = {
  access_token: 'ya29.a0AfH6SMBxNewAccessToken111222333',
  expires_in: 3600,
  token_type: 'Bearer',
  // Nota: Google NON sempre restituisce un nuovo refresh_token
  // refresh_token: opzionale
};

export const MOCK_USER_INFO = {
  email: 'test@example.com',
  verified_email: true,
  id: '1234567890',
  picture: 'https://lh3.googleusercontent.com/a/fake-picture',
};

// Errori mock
export const MOCK_ERRORS = {
  INVALID_GRANT: {
    error: 'invalid_grant',
    error_description: 'Token has been expired or revoked.',
  },
  INVALID_CODE: {
    error: 'invalid_grant',
    error_description: 'Invalid authorization code.',
  },
  NETWORK_ERROR: new Error('Network error'),
};

/**
 * Setup mock per exchangeCodeForTokens (POST /token)
 *
 * @param scenario - 'success' | 'invalid_code' | 'network_error'
 */
export function mockExchangeCodeForTokens(
  scenario: 'success' | 'invalid_code' | 'network_error' = 'success'
) {
  const mockFetch = vi.spyOn(global, 'fetch');

  if (scenario === 'success') {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_TOKENS,
    } as Response);
  } else if (scenario === 'invalid_code') {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => MOCK_ERRORS.INVALID_CODE,
    } as Response);
  } else if (scenario === 'network_error') {
    mockFetch.mockRejectedValueOnce(MOCK_ERRORS.NETWORK_ERROR);
  }

  return mockFetch;
}

/**
 * Setup mock per refreshAccessToken (POST /token)
 *
 * @param scenario - 'success' | 'revoked' | 'network_error'
 */
export function mockRefreshAccessToken(
  scenario: 'success' | 'revoked' | 'network_error' = 'success'
) {
  const mockFetch = vi.spyOn(global, 'fetch');

  if (scenario === 'success') {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_REFRESHED_TOKENS,
    } as Response);
  } else if (scenario === 'revoked') {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => MOCK_ERRORS.INVALID_GRANT,
    } as Response);
  } else if (scenario === 'network_error') {
    mockFetch.mockRejectedValueOnce(MOCK_ERRORS.NETWORK_ERROR);
  }

  return mockFetch;
}

/**
 * Setup mock per getUserInfo (GET /oauth2/v2/userinfo)
 *
 * @param scenario - 'success' | 'unauthorized' | 'network_error'
 */
export function mockGetUserInfo(
  scenario: 'success' | 'unauthorized' | 'network_error' = 'success'
) {
  const mockFetch = vi.spyOn(global, 'fetch');

  if (scenario === 'success') {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_USER_INFO,
    } as Response);
  } else if (scenario === 'unauthorized') {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    } as Response);
  } else if (scenario === 'network_error') {
    mockFetch.mockRejectedValueOnce(MOCK_ERRORS.NETWORK_ERROR);
  }

  return mockFetch;
}

/**
 * Setup completo per tutti i mock OAuth
 * Utile per test che fanno multiple chiamate
 */
export function setupOAuthMocks() {
  const restore = () => {
    vi.restoreAllMocks();
  };

  return {
    mockExchangeCode: mockExchangeCodeForTokens,
    mockRefresh: mockRefreshAccessToken,
    mockUserInfo: mockGetUserInfo,
    restore,
  };
}

/**
 * Mock fetch che riconosce automaticamente l'endpoint e risponde di conseguenza
 * Utile per test complessi dove si fanno multiple chiamate
 */
export function mockGoogleOAuthAPI() {
  const mockFetch = vi
    .spyOn(global, 'fetch')
    .mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      // Exchange code for tokens
      if (url.includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_TOKENS,
        } as Response;
      }

      // Get user info
      if (url.includes('oauth2/v2/userinfo')) {
        return {
          ok: true,
          status: 200,
          json: async () => MOCK_USER_INFO,
        } as Response;
      }

      // Fallback: chiamata non mockate
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not Found' }),
      } as Response;
    });

  return mockFetch;
}
