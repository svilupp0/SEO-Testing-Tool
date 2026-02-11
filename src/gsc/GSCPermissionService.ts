/**
 * GSCPermissionService - Gestione permessi Google Search Console
 */

type PermissionLevel = 'siteOwner' | 'siteFullUser' | 'siteRestrictedUser' | 'siteUnverifiedUser';

interface PropertyInfo {
  url: string;
  permissionLevel: PermissionLevel;
}

export class GSCPermissionService {
  private permissionCache: Map<string, { level: PermissionLevel; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minuti

  async checkPropertyAccess(accessToken: string, propertyUrl: string): Promise<boolean> {
    // Controlla cache
    const cached = this.permissionCache.get(propertyUrl);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return this.canReadData(cached.level);
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 404) {
        throw new Error('Proprietà non trovata su Google Search Console.');
      }

      if (response.status === 403) {
        throw new Error('Non hai accesso a questa proprietà su Google Search Console.');
      }

      if (!response.ok) {
        throw new Error('Errore durante la verifica dei permessi.');
      }

      const data = (await response.json()) as { permissionLevel: PermissionLevel };
      
      // Salva in cache
      this.permissionCache.set(propertyUrl, {
        level: data.permissionLevel,
        timestamp: Date.now(),
      });

      return this.canReadData(data.permissionLevel);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Errore durante la verifica dei permessi.');
    }
  }

  async listAvailableProperties(accessToken: string): Promise<PropertyInfo[]> {
    const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Errore durante il recupero delle proprietà.');
    }

    const data = (await response.json()) as {
      siteEntry?: Array<{
        siteUrl: string;
        permissionLevel: PermissionLevel;
      }>;
    };

    if (!data.siteEntry || data.siteEntry.length === 0) {
      return [];
    }

    return data.siteEntry.map((entry) => ({
      url: entry.siteUrl,
      permissionLevel: entry.permissionLevel,
    }));
  }

  async getPermissionLevel(
    accessToken: string,
    propertyUrl: string
  ): Promise<PermissionLevel> {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Errore durante il recupero del livello di permesso.');
    }

    const data = (await response.json()) as { permissionLevel: PermissionLevel };
    return data.permissionLevel;
  }

  canReadData(level: PermissionLevel): boolean {
    // Tutti i livelli tranne siteUnverifiedUser possono leggere
    return level !== 'siteUnverifiedUser';
  }

  async invalidateCache(propertyUrl: string): Promise<void> {
    this.permissionCache.delete(propertyUrl);
  }

  getNoPropertiesMessage(): string {
    return 'Non hai proprietà configurate in Google Search Console. Aggiungi il tuo sito su search.google.com/search-console.';
  }
}
