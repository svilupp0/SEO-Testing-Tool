/**
 * Test 1.5 - Test Permessi GSC
 * 
 * Priorità: ALTA
 * 
 * Obiettivo: Verificare la gestione dei permessi read-only e assenza di 
 * permessi in GSC
 * 
 * Scenario 1: L'utente ha accesso read-only a una proprietà GSC
 * Risultato atteso: Il tool riesce a leggere i dati senza problemi
 * 
 * Scenario 2: L'utente non ha permessi sulla proprietà
 * Risultato atteso: Errore chiaro: 
 * "Non hai accesso a questa proprietà su Google Search Console."
 */

import { GSCPermissionService } from '../../src/gsc/GSCPermissionService';
import { GSCDataFetcher } from '../../src/gsc/GSCDataFetcher';

describe('Test 1.5 - Permessi GSC', () => {
  let permissionService: GSCPermissionService;
  let dataFetcher: GSCDataFetcher;

  beforeEach(() => {
    // Setup: Creiamo le istanze dei servizi
    permissionService = new GSCPermissionService();
    dataFetcher = new GSCDataFetcher();
  });

  it('dovrebbe permettere la lettura di dati con permessi read-only', async () => {
    // Arrange: Utente con accesso read-only a una proprietà GSC
    const userId = 'user-readonly-123';
    const propertyUrl = 'https://example.com';
    const accessToken = 'valid-readonly-token';

    // Mock della risposta Google che indica permessi read-only
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          permissionLevel: 'siteOwner', // Owner ha accesso read
        }),
        { status: 200 }
      )
    );

    // Act: Verifichiamo i permessi
    const hasAccess = await permissionService.checkPropertyAccess(
      accessToken,
      propertyUrl
    );

    // Assert: Deve avere accesso
    expect(hasAccess).toBe(true);
  });

  it('dovrebbe rifiutare l\'accesso quando l\'utente non ha permessi sulla proprietà', async () => {
    // Arrange: Utente senza accesso alla proprietà
    const userId = 'user-no-access-456';
    const propertyUrl = 'https://notmyproperty.com';
    const accessToken = 'valid-token-no-permission';

    // Mock della risposta Google che indica nessun permesso (403)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'User does not have sufficient permissions for this property.',
          },
        }),
        { status: 403 }
      )
    );

    // Act & Assert: Deve lanciare errore chiaro
    await expect(
      dataFetcher.fetchSearchAnalytics(accessToken, propertyUrl, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })
    ).rejects.toThrow('Non hai accesso a questa proprietà su Google Search Console.');
  });

  it('dovrebbe elencare solo le proprietà a cui l\'utente ha accesso', async () => {
    // Arrange: Utente con accesso a multiple properties
    const accessToken = 'valid-token-multi-props';

    // Mock della risposta GSC API
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          siteEntry: [
            {
              siteUrl: 'https://mysite1.com/',
              permissionLevel: 'siteOwner',
            },
            {
              siteUrl: 'https://mysite2.com/',
              permissionLevel: 'siteFullUser',
            },
            {
              siteUrl: 'sc-domain:mysite3.com',
              permissionLevel: 'siteRestrictedUser',
            },
          ],
        }),
        { status: 200 }
      )
    );

    // Act: Recuperiamo la lista delle proprietà
    const properties = await permissionService.listAvailableProperties(accessToken);

    // Assert: Deve ricevere tutte le proprietà accessibili
    expect(properties).toHaveLength(3);
    expect(properties[0].url).toBe('https://mysite1.com/');
    expect(properties[0].permissionLevel).toBe('siteOwner');
  });

  it('dovrebbe distinguere tra diversi livelli di permesso GSC', async () => {
    // Arrange: Test per diversi livelli di permesso
    const accessToken = 'token-permission-levels';

    // Test 1: siteOwner (accesso completo)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ permissionLevel: 'siteOwner' }),
        { status: 200 }
      )
    );

    let level = await permissionService.getPermissionLevel(
      accessToken,
      'https://owner.com'
    );
    expect(level).toBe('siteOwner');
    expect(permissionService.canReadData(level)).toBe(true);

    // Test 2: siteFullUser (può leggere)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ permissionLevel: 'siteFullUser' }),
        { status: 200 }
      )
    );

    level = await permissionService.getPermissionLevel(
      accessToken,
      'https://fulluser.com'
    );
    expect(level).toBe('siteFullUser');
    expect(permissionService.canReadData(level)).toBe(true);

    // Test 3: siteRestrictedUser (può leggere)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ permissionLevel: 'siteRestrictedUser' }),
        { status: 200 }
      )
    );

    level = await permissionService.getPermissionLevel(
      accessToken,
      'https://restricted.com'
    );
    expect(level).toBe('siteRestrictedUser');
    expect(permissionService.canReadData(level)).toBe(true);

    // Test 4: siteUnverifiedUser (non può leggere)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ permissionLevel: 'siteUnverifiedUser' }),
        { status: 200 }
      )
    );

    level = await permissionService.getPermissionLevel(
      accessToken,
      'https://unverified.com'
    );
    expect(level).toBe('siteUnverifiedUser');
    expect(permissionService.canReadData(level)).toBe(false);
  });

  it('dovrebbe gestire proprietà inesistenti o rimosse', async () => {
    // Arrange: Proprietà che non esiste più in GSC
    const accessToken = 'valid-token';
    const deletedProperty = 'https://deleted-site.com';

    // Mock della risposta 404
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 404,
            message: 'Requested entity was not found.',
          },
        }),
        { status: 404 }
      )
    );

    // Act & Assert: Deve gestire correttamente
    await expect(
      permissionService.checkPropertyAccess(accessToken, deletedProperty)
    ).rejects.toThrow('Proprietà non trovata su Google Search Console.');
  });

  it('dovrebbe verificare i permessi prima di ogni fetch di dati', async () => {
    // Arrange: Fetch che richiede permessi validi
    const accessToken = 'token-check-before-fetch';
    const propertyUrl = 'https://strict-check.com';

    // Mock: Prima chiamata - check permessi (fallisce)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 403, message: 'Forbidden' },
        }),
        { status: 403 }
      )
    );

    // Act & Assert: Non deve nemmeno tentare il fetch dei dati
    await expect(
      dataFetcher.fetchSearchAnalytics(accessToken, propertyUrl, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })
    ).rejects.toThrow('Non hai accesso a questa proprietà su Google Search Console.');
  });

  it('dovrebbe gestire la rimozione dell\'accesso durante l\'uso dell\'app', async () => {
    // Arrange: L'utente aveva accesso, ma viene rimosso durante l'uso
    const accessToken = 'token-permission-revoked';
    const propertyUrl = 'https://access-removed.com';

    // Prima chiamata: successo
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          permissionLevel: 'siteOwner',
        }),
        { status: 200 }
      )
    );

    const hasAccessInitially = await permissionService.checkPropertyAccess(
      accessToken,
      propertyUrl
    );
    expect(hasAccessInitially).toBe(true);

    // Seconda chiamata: permesso rimosso
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 403, message: 'Permission denied' },
        }),
        { status: 403 }
      )
    );

    // Act & Assert: Deve rilevare la perdita di accesso
    await expect(
      dataFetcher.fetchSearchAnalytics(accessToken, propertyUrl, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      })
    ).rejects.toThrow('Non hai accesso a questa proprietà su Google Search Console.');
  });

  it('dovrebbe mostrare messaggi diversi per proprietà non trovata vs no permissions', async () => {
    // Arrange
    const accessToken = 'token-error-messages';

    // Test 1: Proprietà non trovata (404)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 404 } }),
        { status: 404 }
      )
    );

    await expect(
      permissionService.checkPropertyAccess(accessToken, 'https://notfound.com')
    ).rejects.toThrow('Proprietà non trovata su Google Search Console.');

    // Test 2: Nessun permesso (403)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 403 } }),
        { status: 403 }
      )
    );

    await expect(
      permissionService.checkPropertyAccess(accessToken, 'https://forbidden.com')
    ).rejects.toThrow('Non hai accesso a questa proprietà su Google Search Console.');
  });

  it('dovrebbe supportare sia URL properties che Domain properties', async () => {
    // Arrange: Test con entrambi i tipi di proprietà GSC
    const accessToken = 'token-property-types';

    // Mock per URL property (https://)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ permissionLevel: 'siteOwner' }),
        { status: 200 }
      )
    );

    const urlAccess = await permissionService.checkPropertyAccess(
      accessToken,
      'https://example.com/'
    );
    expect(urlAccess).toBe(true);

    // Mock per Domain property (sc-domain:)
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ permissionLevel: 'siteOwner' }),
        { status: 200 }
      )
    );

    const domainAccess = await permissionService.checkPropertyAccess(
      accessToken,
      'sc-domain:example.com'
    );
    expect(domainAccess).toBe(true);
  });

  it('dovrebbe cachare i permessi per evitare chiamate ripetute', async () => {
    // Arrange
    const accessToken = 'token-cache-permissions';
    const propertyUrl = 'https://cached.com';

    const fetchSpy = vi.spyOn(global, 'fetch');

    // Prima chiamata
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ permissionLevel: 'siteOwner' }),
        { status: 200 }
      )
    );

    await permissionService.checkPropertyAccess(accessToken, propertyUrl);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Seconda chiamata - deve usare cache
    await permissionService.checkPropertyAccess(accessToken, propertyUrl);
    
    // Assert: Non deve fare una seconda chiamata HTTP
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Ancora 1, non 2
  });

  it('dovrebbe invalidare la cache quando i permessi cambiano', async () => {
    // Arrange
    const accessToken = 'token-cache-invalidation';
    const propertyUrl = 'https://changing-perms.com';

    // Prima chiamata: ha accesso
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ permissionLevel: 'siteOwner' }),
        { status: 200 }
      )
    );

    const access1 = await permissionService.checkPropertyAccess(
      accessToken,
      propertyUrl
    );
    expect(access1).toBe(true);

    // Forziamo l'invalidazione della cache
    await permissionService.invalidateCache(propertyUrl);

    // Nuova chiamata: deve controllare di nuovo
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 403 } }),
        { status: 403 }
      )
    );

    // Act & Assert: Deve rilevare il cambiamento
    await expect(
      permissionService.checkPropertyAccess(accessToken, propertyUrl)
    ).rejects.toThrow('Non hai accesso a questa proprietà su Google Search Console.');
  });

  it('dovrebbe fornire un messaggio utile quando nessuna proprietà è disponibile', async () => {
    // Arrange: Utente senza proprietà in GSC
    const accessToken = 'token-no-properties';

    // Mock: nessuna proprietà disponibile
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ siteEntry: [] }),
        { status: 200 }
      )
    );

    // Act: Tentiamo di elencare le proprietà
    const properties = await permissionService.listAvailableProperties(accessToken);

    // Assert: Lista vuota + messaggio chiaro nel sistema
    expect(properties).toHaveLength(0);
    
    // Il sistema dovrebbe mostrare un messaggio guida
    const userMessage = permissionService.getNoPropertiesMessage();
    expect(userMessage).toContain('Non hai proprietà configurate in Google Search Console');
    expect(userMessage).toContain('Aggiungi il tuo sito');
  });
});
