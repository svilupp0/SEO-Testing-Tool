/**
 * Test 8 - UI/UX (L'Esperienza)
 *
 * Questi test verificano che l'interfaccia sia usabile, veloce e accessibile
 *
 * TDD RED → GREEN workflow
 */

import { LoadingIndicatorService } from '../../src/ui/LoadingIndicatorService';
import { ResponsiveLayoutService } from '../../src/ui/ResponsiveLayoutService';
import { ExportService } from '../../src/ui/ExportService';

describe('Test 8.1 - Caricamento Infinito', () => {

  it('dovrebbe mostrare barra di progresso durante fetch lungo (30s)', async () => {
    // Arrange: Simuliamo fetch GSC lungo 30 secondi
    const loadingService = new LoadingIndicatorService();

    const longRunningTask = async (updateProgress: (progress: number) => void) => {
      // Simula task che riporta progresso
      for (let i = 0; i <= 100; i += 10) {
        updateProgress(i);
        await new Promise(resolve => setTimeout(resolve, 50)); // Simula lavoro
      }
    };

    // Act: Avviamo task con progress tracking
    const progressUpdates: number[] = [];
    await loadingService.trackProgress('fetch-gsc-data', async (updateFn) => {
      await longRunningTask(updateFn);
    }, (progress) => {
      progressUpdates.push(progress);
    });

    // Assert: Deve aver ricevuto aggiornamenti di progresso
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[0]).toBe(0); // Inizia da 0%
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100); // Finisce a 100%
  });

  it('dovrebbe mostrare messaggio descrittivo durante il caricamento', async () => {
    // Arrange
    const loadingService = new LoadingIndicatorService();

    // Act: Avviamo loading con messaggio
    const loading = await loadingService.startLoading('fetch-gsc', {
      message: 'Recupero dati da Google Search Console...',
      showProgress: true,
    });

    // Assert: Messaggio deve essere disponibile
    expect(loading.message).toBe('Recupero dati da Google Search Console...');
    expect(loading.isVisible).toBe(true);

    // Cleanup
    await loadingService.stopLoading('fetch-gsc');
  });

  it('dovrebbe aggiornare percentuale progressivamente (0% → 45% → 100%)', async () => {
    // Arrange
    const loadingService = new LoadingIndicatorService();

    // Act: Simuliamo avanzamento progressivo
    await loadingService.startLoading('progress-test', { showProgress: true });

    await loadingService.updateProgress('progress-test', 0);
    const state0 = await loadingService.getLoadingState('progress-test');

    await loadingService.updateProgress('progress-test', 45);
    const state45 = await loadingService.getLoadingState('progress-test');

    await loadingService.updateProgress('progress-test', 100);
    const state100 = await loadingService.getLoadingState('progress-test');

    // Assert: Progressione corretta
    expect(state0.progress).toBe(0);
    expect(state45.progress).toBe(45);
    expect(state100.progress).toBe(100);

    // Cleanup
    await loadingService.stopLoading('progress-test');
  });

  it('NON dovrebbe lasciare pagina bianca senza feedback', async () => {
    // Arrange: Task che impiega tempo
    const loadingService = new LoadingIndicatorService();

    const slowTask = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    };

    // Act: Eseguiamo task con loading
    await loadingService.startLoading('slow-task', {
      message: 'Elaborazione in corso...',
    });

    const stateDuringTask = await loadingService.getLoadingState('slow-task');

    await slowTask();
    await loadingService.stopLoading('slow-task');

    const stateAfterTask = await loadingService.getLoadingState('slow-task');

    // Assert: Durante task deve mostrare feedback
    expect(stateDuringTask.isVisible).toBe(true);
    expect(stateDuringTask.message).toBeTruthy();

    // Dopo task, loading deve essere chiuso
    expect(stateAfterTask.isVisible).toBe(false);
  });

  it('dovrebbe gestire timeout per operazioni che impiegano troppo tempo', async () => {
    // Arrange
    const loadingService = new LoadingIndicatorService();

    const verySlowTask = async () => {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 secondi
    };

    // Act: Avviamo task con timeout di 1 secondo
    const result = await loadingService.executeWithTimeout(
      'timeout-test',
      verySlowTask,
      1000 // 1 secondo timeout
    );

    // Assert: Deve segnalare timeout
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain('timeout');
  });

  it('dovrebbe mostrare spinner per operazioni senza percentuale definita', async () => {
    // Arrange
    const loadingService = new LoadingIndicatorService();

    // Act: Avviamo loading senza progress
    const loading = await loadingService.startLoading('spinner-test', {
      message: 'Caricamento...',
      showProgress: false, // Solo spinner
    });

    // Assert: Spinner attivo ma senza percentuale
    expect(loading.isVisible).toBe(true);
    expect(loading.showSpinner).toBe(true);
    expect(loading.showProgress).toBe(false);

    // Cleanup
    await loadingService.stopLoading('spinner-test');
  });
});

describe('Test 8.2 - Mobile', () => {

  it('dovrebbe rendere grafici responsive su viewport mobile (375px)', async () => {
    // Arrange: Grafico statistico complesso
    const layoutService = new ResponsiveLayoutService();

    const chartConfig = {
      type: 'line',
      data: [10, 20, 30, 40, 50],
      width: 1200,
      height: 600,
    };

    // Act: Adattiamo per mobile (iPhone)
    const mobileLayout = await layoutService.adaptForViewport(chartConfig, {
      width: 375,
      height: 667,
      deviceType: 'mobile',
    });

    // Assert: Dimensioni adattate
    expect(mobileLayout.width).toBeLessThanOrEqual(375);
    expect(mobileLayout.height).toBeLessThan(600);
    expect(mobileLayout.responsive).toBe(true);
  });

  it('dovrebbe rendere testo leggibile su mobile (min 14px)', async () => {
    // Arrange
    const layoutService = new ResponsiveLayoutService();

    const textConfig = {
      fontSize: 12, // Troppo piccolo
      content: 'Miglioramento: +25% clicks',
    };

    // Act: Adattiamo per mobile
    const mobileText = await layoutService.adaptTextForMobile(textConfig);

    // Assert: Font size aumentato per leggibilità
    expect(mobileText.fontSize).toBeGreaterThanOrEqual(14);
    expect(mobileText.readable).toBe(true);
  });

  it('dovrebbe supportare interazioni touch (pinch-to-zoom)', async () => {
    // Arrange
    const layoutService = new ResponsiveLayoutService();

    const chartElement = {
      id: 'stats-chart',
      zoomEnabled: false,
    };

    // Act: Abilita touch interactions
    const touchEnabled = await layoutService.enableTouchInteractions(chartElement);

    // Assert: Touch gestures abilitati
    expect(touchEnabled.zoomEnabled).toBe(true);
    expect(touchEnabled.pinchToZoom).toBe(true);
    expect(touchEnabled.touchScroll).toBe(true);
  });

  it('NON dovrebbe tagliare grafici su schermo piccolo', async () => {
    // Arrange: Grafico largo
    const layoutService = new ResponsiveLayoutService();

    const wideChart = {
      width: 1920,
      height: 1080,
      elements: ['legend', 'axis', 'data'],
    };

    // Act: Adattiamo per mobile
    const mobileChart = await layoutService.fitToViewport(wideChart, {
      width: 375,
      height: 667,
    });

    // Assert: Tutto visibile, nulla tagliato
    expect(mobileChart.overflow).toBe('none');
    expect(mobileChart.allElementsVisible).toBe(true);
    expect(mobileChart.requiresScroll).toBe(false);
  });

  it('dovrebbe usare layout a colonna singola su mobile', async () => {
    // Arrange
    const layoutService = new ResponsiveLayoutService();

    const desktopLayout = {
      columns: 3, // 3 colonne su desktop
      items: [
        { id: 'chart1' },
        { id: 'chart2' },
        { id: 'chart3' },
      ],
    };

    // Act: Adattiamo per mobile
    const mobileLayout = await layoutService.adaptLayout(desktopLayout, {
      width: 375,
      deviceType: 'mobile',
    });

    // Assert: Colonna singola
    expect(mobileLayout.columns).toBe(1);
    expect(mobileLayout.stackVertically).toBe(true);
  });

  it('dovrebbe testare su vari dispositivi (iPhone, Android, iPad)', async () => {
    // Arrange
    const layoutService = new ResponsiveLayoutService();

    const content = {
      type: 'dashboard',
      charts: 3,
      tables: 2,
    };

    // Act: Testiamo su vari device
    const iPhoneLayout = await layoutService.renderForDevice(content, 'iPhone 13');
    const androidLayout = await layoutService.renderForDevice(content, 'Samsung Galaxy S21');
    const iPadLayout = await layoutService.renderForDevice(content, 'iPad Pro');

    // Assert: Tutti i layout funzionano
    expect(iPhoneLayout.compatible).toBe(true);
    expect(androidLayout.compatible).toBe(true);
    expect(iPadLayout.compatible).toBe(true);

    // iPad può avere 2 colonne
    expect(iPadLayout.columns).toBeGreaterThanOrEqual(1);
  });

  it('dovrebbe mantenere performance su mobile (< 3s caricamento)', async () => {
    // Arrange
    const layoutService = new ResponsiveLayoutService();

    const heavyContent = {
      charts: 5,
      dataPoints: 10000,
    };

    // Act: Misuriamo performance
    const startTime = Date.now();
    await layoutService.renderForDevice(heavyContent, 'iPhone 13');
    const loadTime = Date.now() - startTime;

    // Assert: Caricamento rapido
    expect(loadTime).toBeLessThan(3000); // < 3 secondi
  });
});

describe('Test 8.3 - Esportazione', () => {

  it('dovrebbe esportare dati identici a quelli visualizzati in UI', async () => {
    // Arrange: Dati visualizzati nell'interfaccia
    const exportService = new ExportService();

    const uiData = {
      testName: 'Titolo Ottimizzato',
      clicks: 1250,
      impressions: 15000,
      improvement: 0.25, // +25%
      pValue: 0.03,
      confidenceLevel: 0.95,
    };

    // Act: Esportiamo in CSV
    const csvExport = await exportService.exportToCSV(uiData);
    const exportedData = await exportService.parseCSV(csvExport);

    // Assert: Numeri IDENTICI
    expect(exportedData.clicks).toBe(uiData.clicks);
    expect(exportedData.impressions).toBe(uiData.impressions);
    expect(exportedData.improvement).toBe(uiData.improvement);
    expect(exportedData.pValue).toBe(uiData.pValue);
  });

  it('dovrebbe esportare PDF con numeri identici alla UI', async () => {
    // Arrange
    const exportService = new ExportService();

    const reportData = {
      testId: 'test-pdf-123',
      title: 'Report Test A/B',
      metrics: {
        before: { clicks: 1000, impressions: 10000 },
        after: { clicks: 1250, impressions: 15000 },
        improvement: 25, // 25%
      },
    };

    // Act: Esportiamo PDF
    const pdfBuffer = await exportService.exportToPDF(reportData);
    const extractedData = await exportService.extractDataFromPDF(pdfBuffer);

    // Assert: Dati identici
    expect(extractedData.metrics.before.clicks).toBe(1000);
    expect(extractedData.metrics.after.clicks).toBe(1250);
    expect(extractedData.metrics.improvement).toBe(25);
  });

  it('NON dovrebbe avere discrepanze nei decimali (arrotondamento)', async () => {
    // Arrange: Valore con molti decimali
    const exportService = new ExportService();

    const uiData = {
      improvement: 0.2567, // 25.67% in UI
      confidenceLevel: 0.9512, // 95.12% in UI
      pValue: 0.0234, // 2.34% in UI
    };

    // Act: Esportiamo e re-importiamo
    const csvExport = await exportService.exportToCSV(uiData);
    const reimported = await exportService.parseCSV(csvExport);

    // Assert: Stessa precisione
    expect(reimported.improvement).toBeCloseTo(0.2567, 4);
    expect(reimported.confidenceLevel).toBeCloseTo(0.9512, 4);
    expect(reimported.pValue).toBeCloseTo(0.0234, 4);
  });

  it('dovrebbe preservare formattazione percentuali nell\'export', async () => {
    // Arrange
    const exportService = new ExportService();

    const uiData = {
      improvement: 0.25, // Visualizzato come "+25%"
      ctr: 0.083, // Visualizzato come "8.3%"
    };

    // Act: Esportiamo CSV
    const csvExport = await exportService.exportToCSV(uiData, {
      formatPercentages: true,
    });

    // Assert: Percentuali formattate
    expect(csvExport).toContain('+25%');
    expect(csvExport).toContain('8.3%');
  });

  it('dovrebbe gestire export di dataset grandi (10k+ righe)', async () => {
    // Arrange: 10,000 righe di dati
    const exportService = new ExportService();

    const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
      day: i + 1,
      clicks: Math.floor(Math.random() * 1000),
      impressions: Math.floor(Math.random() * 10000),
    }));

    // Act: Esportiamo
    const startTime = Date.now();
    const csvExport = await exportService.exportToCSV(largeDataset);
    const exportTime = Date.now() - startTime;

    // Assert: Export completato
    expect(csvExport).toBeTruthy();
    expect(csvExport.split('\n').length).toBeGreaterThan(10000);
    expect(exportTime).toBeLessThan(5000); // < 5 secondi
  });

  it('dovrebbe validare integrità dati durante export', async () => {
    // Arrange
    const exportService = new ExportService();

    const uiData = {
      clicks: 1250,
      impressions: 15000,
      ctr: 1250 / 15000, // CTR calcolato
    };

    // Act: Esportiamo e verifichiamo integrità
    const exported = await exportService.exportWithValidation(uiData);

    // Assert: Validazione passata
    expect(exported.valid).toBe(true);
    expect(exported.errors).toHaveLength(0);
    expect(exported.data.ctr).toBeCloseTo(0.0833, 4);
  });

  it('dovrebbe supportare export multipli formati (CSV, PDF, Excel)', async () => {
    // Arrange
    const exportService = new ExportService();

    const reportData = {
      testName: 'Test Export Multi-Format',
      clicks: 1000,
      impressions: 10000,
    };

    // Act: Esportiamo in vari formati
    const csvExport = await exportService.exportToCSV(reportData);
    const pdfExport = await exportService.exportToPDF(reportData);
    const excelExport = await exportService.exportToExcel(reportData);

    // Assert: Tutti i formati generati
    expect(csvExport).toBeTruthy();
    expect(pdfExport).toBeTruthy();
    expect(excelExport).toBeTruthy();

    // Dati identici in tutti i formati
    const csvData = await exportService.parseCSV(csvExport);
    expect(csvData.clicks).toBe(1000);
  });

  it('dovrebbe includere metadata nel file esportato (data export, versione)', async () => {
    // Arrange
    const exportService = new ExportService();

    const reportData = {
      testName: 'Test Metadata',
      clicks: 500,
    };

    // Act: Esportiamo con metadata
    const exported = await exportService.exportWithMetadata(reportData, {
      includeTimestamp: true,
      includeVersion: true,
    });

    // Assert: Metadata presente
    expect(exported.metadata.exportDate).toBeDefined();
    expect(exported.metadata.toolVersion).toBeDefined();
    expect(exported.metadata.format).toBe('csv');
  });
});
