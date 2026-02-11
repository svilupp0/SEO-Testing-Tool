/**
 * Test 7 - Casi Estremi (I "Cattivi")
 *
 * Questi sono gli edge cases che fanno crashare i tool mal progettati
 *
 * TDD RED → GREEN workflow
 */

import { URLMonitoringService } from '../../src/monitoring/URLMonitoringService';
import { DomainMigrationService } from '../../src/monitoring/DomainMigrationService';
import { TrafficMonitoringService } from '../../src/monitoring/TrafficMonitoringService';

describe('Test 7.1 - URL Redirect', () => {

  it('dovrebbe rilevare redirect 301 durante il test', async () => {
    // Arrange: URL che riceve redirect 301
    const urlMonitoring = new URLMonitoringService();

    const testId = 'test-redirect-123';
    const originalUrl = 'https://example.com/vecchio-url';
    const newUrl = 'https://example.com/nuovo-url';

    // Simuliamo che GSC riporti redirect
    const gscData = {
      url: originalUrl,
      hasRedirect: true,
      redirectTarget: newUrl,
      redirectType: 301,
      detectedAt: new Date().toISOString(),
    };

    // Act: Verifichiamo se rileva redirect
    const redirectDetection = await urlMonitoring.checkForRedirects(testId, gscData);

    // Assert: Deve rilevare il redirect
    expect(redirectDetection.hasRedirect).toBe(true);
    expect(redirectDetection.redirectTarget).toBe(newUrl);
    expect(redirectDetection.redirectType).toBe(301);
  });

  it('dovrebbe sospendere il test quando rileva redirect', async () => {
    // Arrange
    const urlMonitoring = new URLMonitoringService();

    const testId = 'test-redirect-456';
    const originalUrl = 'https://example.com/old-page';
    const newUrl = 'https://example.com/new-page';

    const redirectInfo = {
      hasRedirect: true,
      redirectTarget: newUrl,
      redirectType: 301,
    };

    // Act: Processiamo redirect
    const result = await urlMonitoring.handleRedirect(testId, originalUrl, redirectInfo);

    // Assert: Test deve essere sospeso in attesa di decisione utente
    expect(result.testStatus).toBe('suspended');
    expect(result.reason).toBe('redirect_detected');
    expect(result.requiresUserAction).toBe(true);
  });

  it('dovrebbe generare messaggio chiaro per utente su redirect', async () => {
    // Arrange
    const urlMonitoring = new URLMonitoringService();

    const testId = 'test-msg';
    const originalUrl = 'https://example.com/vecchio-url';
    const newUrl = 'https://example.com/nuovo-url';

    const redirectInfo = {
      hasRedirect: true,
      redirectTarget: newUrl,
      redirectType: 301,
    };

    // Act
    const message = await urlMonitoring.generateRedirectMessage(
      testId,
      originalUrl,
      redirectInfo
    );

    // Assert: Messaggio deve essere chiaro
    expect(message).toContain('URL reindirizzato');
    expect(message).toContain(originalUrl);
    expect(message).toContain(newUrl);
    expect(message).toContain('Vuoi continuare il test sul nuovo URL?');
  });

  it('dovrebbe permettere migrazione a nuovo URL se utente accetta', async () => {
    // Arrange
    const urlMonitoring = new URLMonitoringService();

    const testId = 'test-migrate';
    const originalUrl = 'https://example.com/old';
    const newUrl = 'https://example.com/new';

    // Act: Utente accetta migrazione
    const result = await urlMonitoring.migrateTestToNewUrl(testId, originalUrl, newUrl, true);

    // Assert: Test deve continuare sul nuovo URL
    expect(result.testUrl).toBe(newUrl);
    expect(result.testStatus).toBe('running');
    expect(result.migrated).toBe(true);
    expect(result.oldUrl).toBe(originalUrl);
  });

  it('dovrebbe terminare test se utente rifiuta migrazione', async () => {
    // Arrange
    const urlMonitoring = new URLMonitoringService();

    const testId = 'test-reject';
    const originalUrl = 'https://example.com/old';
    const newUrl = 'https://example.com/new';

    // Act: Utente rifiuta migrazione
    const result = await urlMonitoring.migrateTestToNewUrl(testId, originalUrl, newUrl, false);

    // Assert: Test deve essere terminato
    expect(result.testStatus).toBe('terminated');
    expect(result.reason).toBe('user_declined_migration');
    expect(result.migrated).toBe(false);
  });

  it('dovrebbe tracciare cronologia redirect per analisi', async () => {
    // Arrange
    const urlMonitoring = new URLMonitoringService();

    const testId = 'test-history';
    const redirectChain = [
      { from: 'https://example.com/url1', to: 'https://example.com/url2', type: 301, date: '2024-01-01' },
      { from: 'https://example.com/url2', to: 'https://example.com/url3', type: 302, date: '2024-01-05' },
    ];

    // Act: Salviamo cronologia redirect
    await urlMonitoring.saveRedirectHistory(testId, redirectChain);
    const history = await urlMonitoring.getRedirectHistory(testId);

    // Assert: Cronologia deve essere tracciata
    expect(history).toHaveLength(2);
    expect(history[0].from).toBe('https://example.com/url1');
    expect(history[1].to).toBe('https://example.com/url3');
  });

  it('NON dovrebbe sospendere test per redirect temporanei 302', async () => {
    // Arrange: Redirect 302 (temporaneo)
    const urlMonitoring = new URLMonitoringService();

    const testId = 'test-302';
    const originalUrl = 'https://example.com/page';
    const tempUrl = 'https://example.com/temp';

    const redirectInfo = {
      hasRedirect: true,
      redirectTarget: tempUrl,
      redirectType: 302, // Temporaneo
    };

    // Act
    const result = await urlMonitoring.handleRedirect(testId, originalUrl, redirectInfo);

    // Assert: Redirect 302 sono temporanei, continuiamo a tracciare URL originale
    expect(result.testStatus).toBe('running');
    expect(result.urlToTrack).toBe(originalUrl); // Continua su URL originale
  });
});

describe('Test 7.2 - Cambio Dominio', () => {

  it('dovrebbe rilevare migrazione HTTP → HTTPS', async () => {
    // Arrange
    const domainMigration = new DomainMigrationService();

    const httpProperty = 'http://example.com/';
    const httpsProperty = 'https://example.com/';

    // Act: Verifichiamo se sono lo stesso sito
    const isSameSite = await domainMigration.isSameSite(httpProperty, httpsProperty);

    // Assert: Deve riconoscere che è lo stesso sito
    expect(isSameSite).toBeTruthy();
    expect(isSameSite.migrationType).toBe('http_to_https');
  });

  it('dovrebbe rilevare cambio da domain property a URL prefix', async () => {
    // Arrange
    const domainMigration = new DomainMigrationService();

    const domainProperty = 'sc-domain:example.com';
    const urlPrefix = 'https://example.com/';

    // Act
    const isSameSite = await domainMigration.isSameSite(domainProperty, urlPrefix);

    // Assert: Deve riconoscere che è lo stesso sito
    expect(isSameSite).toBeTruthy();
    expect(isSameSite.migrationType).toBe('domain_to_url_prefix');
  });

  it('dovrebbe suggerire unione dati tra proprietà', async () => {
    // Arrange
    const domainMigration = new DomainMigrationService();

    const userId = 'user-123';
    const oldProperty = 'http://example.com/';
    const newProperty = 'https://example.com/';

    // Simuliamo che utente abbia test su entrambe
    const testsOldProperty = [
      { testId: 'test-1', property: oldProperty, startDate: '2024-01-01' },
    ];

    const testsNewProperty = [
      { testId: 'test-2', property: newProperty, startDate: '2024-01-15' },
    ];

    // Act: Rileva migrazione
    const migration = await domainMigration.detectMigration(
      userId,
      oldProperty,
      newProperty,
      testsOldProperty,
      testsNewProperty
    );

    // Assert: Deve suggerire unione
    expect(migration.detected).toBe(true);
    expect(migration.shouldMerge).toBe(true);
    expect(migration.affectedTests).toHaveLength(2);
  });

  it('dovrebbe generare messaggio chiaro per utente su migrazione', async () => {
    // Arrange
    const domainMigration = new DomainMigrationService();

    const oldProperty = 'http://example.com/';
    const newProperty = 'https://example.com/';

    // Act
    const message = await domainMigration.generateMigrationMessage(oldProperty, newProperty);

    // Assert: Messaggio chiaro
    expect(message).toContain('http://example.com');
    expect(message).toContain('https://example.com');
    expect(message).toContain('stesso sito');
    expect(message).toContain('Unire i dati delle due proprietà?');
  });

  it('dovrebbe unire dati se utente accetta', async () => {
    // Arrange
    const domainMigration = new DomainMigrationService();

    const userId = 'user-123';
    const oldProperty = 'http://example.com/';
    const newProperty = 'https://example.com/';

    const testsToMerge = [
      { testId: 'test-old', property: oldProperty },
      { testId: 'test-new', property: newProperty },
    ];

    // Act: Utente accetta unione
    const result = await domainMigration.mergeProperties(
      userId,
      oldProperty,
      newProperty,
      testsToMerge,
      true // user accepts
    );

    // Assert: Dati uniti
    expect(result.merged).toBe(true);
    expect(result.primaryProperty).toBe(newProperty); // HTTPS diventa principale
    expect(result.mergedTests).toHaveLength(2);
  });

  it('NON dovrebbe unire proprietà completamente diverse', async () => {
    // Arrange
    const domainMigration = new DomainMigrationService();

    const siteA = 'https://sito-a.com/';
    const siteB = 'https://sito-completamente-diverso.com/';

    // Act
    const isSameSite = await domainMigration.isSameSite(siteA, siteB);

    // Assert: NON sono lo stesso sito
    expect(isSameSite).toBe(false);
  });

  it('dovrebbe gestire migrazione con cambio sottodominio', async () => {
    // Arrange
    const domainMigration = new DomainMigrationService();

    const oldProperty = 'https://www.example.com/';
    const newProperty = 'https://example.com/'; // Rimozione www

    // Act
    const isSameSite = await domainMigration.isSameSite(oldProperty, newProperty);

    // Assert: Potenzialmente lo stesso sito (ma serve conferma utente)
    expect(isSameSite.possiblyRelated).toBe(true);
    expect(isSameSite.requiresUserConfirmation).toBe(true);
  });
});

describe('Test 7.3 - Sito Morto', () => {

  it('dovrebbe rilevare traffico zero per 7 giorni consecutivi', async () => {
    // Arrange
    const trafficMonitoring = new TrafficMonitoringService();

    const testId = 'test-dead-site';
    const zeroTrafficDays = Array.from({ length: 7 }, (_, i) => ({
      date: `2024-01-${i + 1}`,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    }));

    // Act: Verifichiamo traffico
    const analysis = await trafficMonitoring.analyzeTraffic(testId, zeroTrafficDays);

    // Assert: Deve rilevare sito morto
    expect(analysis.isZeroTraffic).toBe(true);
    expect(analysis.consecutiveZeroDays).toBe(7);
    expect(analysis.sitePossiblyOffline).toBe(true);
  });

  it('dovrebbe sospendere tutti i test attivi quando sito è offline', async () => {
    // Arrange
    const trafficMonitoring = new TrafficMonitoringService();

    const testId = 'test-suspend';
    const property = 'https://example.com/';

    const zeroTrafficData = {
      consecutiveZeroDays: 7,
      sitePossiblyOffline: true,
    };

    // Act: Processiamo situazione sito offline
    const result = await trafficMonitoring.handleZeroTraffic(testId, property, zeroTrafficData);

    // Assert: Test sospesi
    expect(result.action).toBe('suspend_tests');
    expect(result.affectedTests).toContain(testId);
    expect(result.reason).toBe('site_possibly_offline');
  });

  it('dovrebbe generare alert critico per utente', async () => {
    // Arrange
    const trafficMonitoring = new TrafficMonitoringService();

    const testId = 'test-alert';
    const property = 'https://example.com/';
    const consecutiveDays = 7;

    // Act: Generiamo alert
    const alert = await trafficMonitoring.generateZeroTrafficAlert(
      testId,
      property,
      consecutiveDays
    );

    // Assert: Alert critico
    expect(alert.severity).toBe('critical');
    expect(alert.message).toContain('Nessun traffico rilevato da 7 giorni');
    expect(alert.message).toContain('Il sito potrebbe essere offline');
    expect(alert.message).toContain('I test sono sospesi');
    expect(alert.action).toBe('verify_site_status');
  });

  it('NON dovrebbe dichiarare test "peggiorati" se sito è offline', async () => {
    // Arrange
    const trafficMonitoring = new TrafficMonitoringService();

    const testId = 'test-no-false-negative';

    const testResults = {
      beforePeriod: { avgClicks: 100, avgImpressions: 1000 },
      afterPeriod: { avgClicks: 0, avgImpressions: 0 }, // Zero totale
      consecutiveZeroDays: 7,
    };

    // Act: Analizziamo risultati
    const analysis = await trafficMonitoring.analyzeTestResults(testId, testResults);

    // Assert: NON deve dichiarare test peggiorato
    expect(analysis.testStatus).not.toBe('worsened');
    expect(analysis.testStatus).toBe('suspended_zero_traffic');
    expect(analysis.validResult).toBe(false);
    expect(analysis.reason).toBe('site_offline_suspected');
  });

  it('dovrebbe riprendere test quando traffico ritorna', async () => {
    // Arrange
    const trafficMonitoring = new TrafficMonitoringService();

    const testId = 'test-resume';
    const property = 'https://example.com/';

    // Simuliamo traffico che ritorna
    const trafficReturned = [
      { date: '2024-01-08', clicks: 50, impressions: 500 },
      { date: '2024-01-09', clicks: 60, impressions: 600 },
    ];

    // Act: Verifichiamo se traffico è tornato
    const result = await trafficMonitoring.checkTrafficRecovery(testId, property, trafficReturned);

    // Assert: Test devono riprendere
    expect(result.trafficRecovered).toBe(true);
    expect(result.action).toBe('resume_tests');
    expect(result.resumeDate).toBeDefined();
  });

  it('dovrebbe distinguere tra sito offline e cambio stagionale', async () => {
    // Arrange: Traffico basso ma non zero (stagionalità)
    const trafficMonitoring = new TrafficMonitoringService();

    const testId = 'test-seasonal';
    const lowTrafficDays = Array.from({ length: 7 }, (_, i) => ({
      date: `2024-01-${i + 1}`,
      clicks: 2, // Basso ma non zero
      impressions: 20,
      ctr: 0.1,
      position: 15,
    }));

    // Act
    const analysis = await trafficMonitoring.analyzeTraffic(testId, lowTrafficDays);

    // Assert: NON è sito morto, è solo traffico basso
    expect(analysis.isZeroTraffic).toBe(false);
    expect(analysis.sitePossiblyOffline).toBe(false);
    expect(analysis.lowTraffic).toBe(true);
    expect(analysis.possibleCause).toBe('seasonal_or_legitimate_drop');
  });

  it('dovrebbe richiedere conferma manuale prima di sospendere', async () => {
    // Arrange
    const trafficMonitoring = new TrafficMonitoringService();

    const testId = 'test-confirm';
    const property = 'https://example.com/';

    const zeroTrafficData = {
      consecutiveZeroDays: 7,
      sitePossiblyOffline: true,
    };

    // Act
    const suspensionRequest = await trafficMonitoring.requestTestSuspension(
      testId,
      property,
      zeroTrafficData
    );

    // Assert: Deve richiedere conferma utente
    expect(suspensionRequest.requiresUserConfirmation).toBe(true);
    expect(suspensionRequest.message).toContain('Confermi la sospensione');
    expect(suspensionRequest.options).toContain('verify_manually');
  });

  it('dovrebbe tracciare downtime per statistiche', async () => {
    // Arrange
    const trafficMonitoring = new TrafficMonitoringService();

    const testId = 'test-downtime';
    const property = 'https://example.com/';

    const downtimeEvent = {
      startDate: '2024-01-01',
      endDate: '2024-01-07',
      consecutiveDays: 7,
      cause: 'suspected_offline',
    };

    // Act: Tracciamo downtime
    await trafficMonitoring.recordDowntime(testId, property, downtimeEvent);
    const history = await trafficMonitoring.getDowntimeHistory(testId);

    // Assert: Downtime tracciato
    expect(history).toHaveLength(1);
    expect(history[0].consecutiveDays).toBe(7);
    expect(history[0].cause).toBe('suspected_offline');
  });
});
