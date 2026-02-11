import { GSCDataFetcher } from '../../src/gsc/GSCDataFetcher';

describe('GSCDataFetcher - Ingestione Dati', () => {
  let fetcher: GSCDataFetcher;

  beforeEach(() => {
    fetcher = new GSCDataFetcher();
  });

  describe('2.1 Test Rate Limit', () => {
    it('dovrebbe implementare exponential backoff quando Google risponde con 429', async () => {
      /**
       * Obiettivo: Verificare la gestione del rate limiting di Google (429 Too Many Requests)
       * 
       * Scenario: Google risponde con errore 429 durante il fetch
       * 
       * Risultato atteso: 
       * - Il sistema implementa exponential backoff: aspetta 1s, poi 2s, poi 4s, poi 8s prima di riprovare
       * - Non deve crashare o ritentare immediatamente creando loop infiniti
       * 
       * Priorità: CRITICA
       */

      // Usa fake timers per controllare i delay
      vi.useFakeTimers();

      // Mock della risposta di Google con errore 429
      const mockFetch = vi.fn()
        .mockRejectedValueOnce({ status: 429, message: 'Too Many Requests' })
        .mockRejectedValueOnce({ status: 429, message: 'Too Many Requests' })
        .mockRejectedValueOnce({ status: 429, message: 'Too Many Requests' })
        .mockResolvedValueOnce({
          rows: [
            { keys: ['https://example.com/page1'], clicks: 100, impressions: 1000 }
          ]
        });

      // Sostituisci il metodo interno di fetch
      vi.spyOn(fetcher as any, 'makeRequest').mockImplementation(mockFetch);

      // Esegui il fetch in modo asincrono
      const fetchPromise = fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });

      // Avanza i timer per simulare i delay
      await vi.advanceTimersByTimeAsync(1000); // 1° retry
      await vi.advanceTimersByTimeAsync(2000); // 2° retry
      await vi.advanceTimersByTimeAsync(4000); // 3° retry

      const result = await fetchPromise;

      // Verifica che abbia fatto 4 tentativi (3 fallimenti + 1 successo)
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Verifica che alla fine abbia restituito i dati
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].clicks).toBe(100);

      vi.useRealTimers();
    });

    it('dovrebbe lanciare errore dopo un numero massimo di retry', async () => {
      /**
       * Comportamento su fallimento: Non deve crashare o creare loop infiniti
       * Dopo un certo numero di tentativi (es. 5), deve restituire un errore appropriato
       */

      // Usa fake timers
      vi.useFakeTimers();

      // Mock che continua a rispondere con 429
      const mockFetch = vi.fn().mockRejectedValue({ 
        status: 429, 
        message: 'Too Many Requests' 
      });

      vi.spyOn(fetcher as any, 'makeRequest').mockImplementation(mockFetch);

      // Esegui il fetch
      const fetchPromise = fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      });

      // Aggancia il rejection handler PRIMA di avanzare i timer
      // per evitare "Unhandled Rejection" durante advanceTimersByTimeAsync
      const assertion = expect(fetchPromise).rejects.toThrow('Rate limit exceeded: troppi tentativi falliti');

      // Avanza tutti i timer necessari (5 retry con exponential backoff)
      await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 16000);

      // Verifica che lanci errore
      await assertion;

      // Verifica che non abbia fatto più di MAX_RETRIES tentativi
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(6); // Initial + 5 retries

      vi.useRealTimers();
  });

  describe('2.4 Test Proprietà Giganti', () => {
    it('dovrebbe gestire siti con milioni di URL usando paginazione e batch processing', async () => {
      /**
       * Obiettivo: Verificare che il sistema gestisca siti con milioni di URL
       * 
       * Scenario: Sito con 1.000.000+ URL in GSC
       * 
       * Risultato atteso:
       * - Il sistema usa la paginazione dell'API GSC
       * - Processa i dati in batch senza timeout
       * - La memoria non va in overflow
       * 
       * Comportamento su fallimento:
       * - Timeout o crash del server durante il fetch
       * 
       * Priorità: ALTA
       */

      const TOTAL_URLS = 1000000;
      const PAGE_SIZE = 25000; // GSC API limit per richiesta
      const EXPECTED_PAGES = Math.ceil(TOTAL_URLS / PAGE_SIZE); // 40 pagine

      let currentPage = 0;

      // Mock che simula risposte paginate da GSC
      const mockPaginatedFetch = vi.fn().mockImplementation((params: any) => {
        const startRow = params.startRow || 0;
        
        // Simula l'ultima pagina
        if (startRow >= TOTAL_URLS) {
          return Promise.resolve({ rows: [] });
        }

        // Calcola quante righe restituire
        const remainingRows = TOTAL_URLS - startRow;
        const rowsToReturn = Math.min(PAGE_SIZE, remainingRows);

        // Genera dati mock per questa pagina
        const rows = Array.from({ length: rowsToReturn }, (_, i) => ({
          keys: [`https://example.com/page-${startRow + i}`],
          clicks: Math.floor(Math.random() * 100),
          impressions: Math.floor(Math.random() * 1000),
          ctr: 0.1,
          position: Math.floor(Math.random() * 100) + 1
        }));

        currentPage++;

        return Promise.resolve({
          rows,
          totalRows: TOTAL_URLS
        });
      });

      vi.spyOn(fetcher as any, 'makeRequest').mockImplementation(mockPaginatedFetch);

      // Esegui il fetch
      const startTime = Date.now();
      
      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        dimensions: ['page']
      });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // 1. Verifica che abbia fatto il numero corretto di richieste paginate
      expect(mockPaginatedFetch).toHaveBeenCalledTimes(EXPECTED_PAGES);

      // 2. Verifica che abbia usato startRow per la paginazione
      const calls = mockPaginatedFetch.mock.calls;
      expect(calls[0][0].startRow).toBe(0);
      expect(calls[1][0].startRow).toBe(PAGE_SIZE);
      expect(calls[2][0].startRow).toBe(PAGE_SIZE * 2);
      
      // 3. Verifica che abbia restituito tutti i dati
      expect(result.rows).toHaveLength(TOTAL_URLS);
      expect(result.totalRows).toBe(TOTAL_URLS);

      // 4. Verifica che non ci siano stati timeout (max 30 secondi per 1M URL)
      expect(executionTime).toBeLessThan(30000);

      // 5. Verifica che i dati siano stati processati correttamente
      expect(result.stats).toBeDefined();
      expect(result.stats.totalClicks).toBeGreaterThan(0);
      expect(result.stats.totalImpressions).toBeGreaterThan(0);

      // 6. Verifica che abbia segnalato il processing in batch
      expect(result.processingInfo).toBeDefined();
      expect(result.processingInfo.totalPages).toBe(EXPECTED_PAGES);
      expect(result.processingInfo.pageSize).toBe(PAGE_SIZE);
    });

    it('dovrebbe gestire errori durante il batch processing di proprietà giganti', async () => {
      /**
       * Scenario edge case: Un errore si verifica durante il processing
       * di una delle pagine (es. pagina 15 su 40)
       * 
       * Risultato atteso:
       * - Il sistema dovrebbe fare retry solo di quella pagina
       * - Non dovrebbe ricominciare da capo
       * - Dovrebbe loggare quale batch ha avuto problemi
       */

      const PAGE_SIZE = 25000;
      let attemptCount = 0;

      const mockFetchWithError = vi.fn().mockImplementation((params: any) => {
        const startRow = params.startRow || 0;
        attemptCount++;

        // Simula un errore al 3° batch, ma solo al primo tentativo
        if (startRow === PAGE_SIZE * 2 && attemptCount === 3) {
          return Promise.reject({ 
            status: 500, 
            message: 'Internal Server Error' 
          });
        }

        // Simula ultima pagina
        if (startRow >= 100000) {
          return Promise.resolve({ rows: [] });
        }

        const rows = Array.from({ length: Math.min(PAGE_SIZE, 100000 - startRow) }, (_, i) => ({
          keys: [`https://example.com/page-${startRow + i}`],
          clicks: 10,
          impressions: 100
        }));

        return Promise.resolve({ rows });
      });

      vi.spyOn(fetcher as any, 'makeRequest').mockImplementation(mockFetchWithError);

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        dimensions: ['page']
      });

      // Verifica che abbia fatto retry del batch fallito
      expect(result.processingInfo.retriesPerformed).toBeGreaterThan(0);
      
      // Verifica che abbia completato comunque il fetch
      expect(result.rows).toHaveLength(100000);
      
      // Verifica che abbia loggato l'errore
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'BATCH_RETRY',
          startRow: PAGE_SIZE * 2
        })
      );
    });

    it('dovrebbe processare i batch in parallelo per migliorare le performance', async () => {
      /**
       * Ottimizzazione: Per siti molto grandi, processare batch in parallelo
       * invece che sequenzialmente può ridurre drasticamente i tempi
       * 
       * Esempio: 40 batch sequenziali a 0.5s = 20s
       *          40 batch in parallelo (5 alla volta) = 4s
       */

      const PAGE_SIZE = 25000;
      const TOTAL_URLS = 100000;
      const CONCURRENT_REQUESTS = 5; // Numero di richieste parallele
      
      const requestTimestamps: number[] = [];

      const mockFetch = vi.fn().mockImplementation(async (params: any) => {
        const startRow = params.startRow || 0;
        
        // Registra quando la richiesta inizia
        requestTimestamps.push(Date.now());
        
        // Simula latenza di rete
        await new Promise(resolve => setTimeout(resolve, 100));

        if (startRow >= TOTAL_URLS) {
          return { rows: [] };
        }

        const rows = Array.from({ length: Math.min(PAGE_SIZE, TOTAL_URLS - startRow) }, (_, i) => ({
          keys: [`https://example.com/page-${startRow + i}`],
          clicks: 10,
          impressions: 100
        }));

        return { rows, totalRows: TOTAL_URLS };
      });

      vi.spyOn(fetcher as any, 'makeRequest').mockImplementation(mockFetch);

      const startTime = Date.now();

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        dimensions: ['page'],
        concurrentRequests: CONCURRENT_REQUESTS // Opzione per richieste parallele
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verifica che abbia fatto tutte le richieste necessarie
      const expectedBatches = Math.ceil(TOTAL_URLS / PAGE_SIZE);
      expect(mockFetch).toHaveBeenCalledTimes(expectedBatches);

      // Verifica che il tempo totale sia inferiore a quello sequenziale
      // Sequenziale: 4 batch * 100ms = 400ms
      // Parallelo (5 concurrent): dovrebbe essere ~100-200ms
      // Soglia 500ms per evitare flaky test sotto carico CPU
      expect(totalTime).toBeLessThan(500);

      // Verifica che alcune richieste siano state fatte in parallelo
      // Analizza i timestamp per vedere se ci sono richieste sovrapposte
      const timeWindows = requestTimestamps.slice(0, -1).map((ts, i) => 
        requestTimestamps[i + 1] - ts
      );
      
      // Almeno alcune richieste devono essere partite quasi contemporaneamente
      const concurrentRequests = timeWindows.filter(diff => diff < 50).length;
      expect(concurrentRequests).toBeGreaterThan(0);

      // Verifica che i risultati siano corretti
      expect(result.rows).toHaveLength(TOTAL_URLS);
    });

    it('dovrebbe fornire feedback di progresso durante il fetch di proprietà giganti', async () => {
      /**
       * UX importante: L'utente deve vedere che il sistema sta lavorando
       * e non è crashato durante il fetch di milioni di URL
       */

      const PAGE_SIZE = 25000;
      const TOTAL_URLS = 200000;
      const progressUpdates: number[] = [];

      const mockFetch = vi.fn().mockImplementation((params: any) => {
        const startRow = params.startRow || 0;

        if (startRow >= TOTAL_URLS) {
          return Promise.resolve({ rows: [] });
        }

        const rows = Array.from({ length: Math.min(PAGE_SIZE, TOTAL_URLS - startRow) }, (_, i) => ({
          keys: [`https://example.com/page-${startRow + i}`],
          clicks: 10,
          impressions: 100
        }));

        return Promise.resolve({ rows, totalRows: TOTAL_URLS });
      });

      vi.spyOn(fetcher as any, 'makeRequest').mockImplementation(mockFetch);

      // Callback per ricevere aggiornamenti di progresso
      const onProgress = vi.fn((progress: number) => {
        progressUpdates.push(progress);
      });

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        dimensions: ['page'],
        onProgress // Callback per monitorare il progresso
      });

      // Verifica che abbia inviato aggiornamenti di progresso
      expect(onProgress).toHaveBeenCalled();
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Verifica che il progresso vada da 0 a 100
      expect(progressUpdates[0]).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);

      // Verifica che il progresso sia crescente
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i]).toBeGreaterThanOrEqual(progressUpdates[i - 1]);
      }

      // Verifica che il risultato finale contenga info sul progresso
      expect(result.processingInfo.progressCallbackInvoked).toBe(true);
      expect(result.rows).toHaveLength(TOTAL_URLS);
    });

    it('dovrebbe rispettare un limite massimo di memoria durante il processing', async () => {
      /**
       * Protezione critica: Anche con milioni di URL,
       * la memoria usata non deve superare un certo limite
       * (es. 500MB) per evitare crash del server
       */

      const PAGE_SIZE = 25000;
      const TOTAL_URLS = 500000;

      const mockFetch = vi.fn().mockImplementation((params: any) => {
        const startRow = params.startRow || 0;

        if (startRow >= TOTAL_URLS) {
          return Promise.resolve({ rows: [] });
        }

        const rows = Array.from({ length: Math.min(PAGE_SIZE, TOTAL_URLS - startRow) }, (_, i) => ({
          keys: [`https://example.com/page-${startRow + i}`],
          clicks: 10,
          impressions: 100,
          // Simula campi aggiuntivi che occupano memoria
          query: `keyword ${startRow + i}`,
          country: 'ITA',
          device: 'MOBILE'
        }));

        return Promise.resolve({ rows });
      });

      vi.spyOn(fetcher as any, 'makeRequest').mockImplementation(mockFetch);

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        dimensions: ['page', 'query', 'country', 'device'],
        maxMemoryMB: 500 // Limite massimo di memoria
      });

      // Verifica che abbia rispettato il limite di memoria
      expect(result.processingInfo.peakMemoryUsageMB).toBeLessThan(500);

      // Se ha dovuto fare streaming/truncating per rispettare il limite
      if (result.processingInfo.memoryLimitReached) {
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            type: 'MEMORY_LIMIT',
            message: expect.stringContaining('limite di memoria')
          })
        );
      }

      // Verifica che abbia comunque processato i dati
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });
});

  describe('2.2 Test Dati Mancanti', () => {
    it('dovrebbe riconoscere il gap temporale e NON calcolarlo come traffico zero', async () => {
      /**
       * Obiettivo: Verificare la gestione del ritardo di 2–3 giorni tipico di GSC
       * 
       * Scenario: GSC non ha ancora dati per gli ultimi 2 giorni
       * 
       * Risultato atteso:
       * - Il sistema riconosce il gap temporale
       * - NON lo calcola come traffico zero
       * - Messaggio: "Dati non ancora disponibili per le ultime 48 ore."
       * 
       * Comportamento su fallimento: 
       * - Interpretare il gap come perdita di traffico invalida completamente l'analisi
       * 
       * Priorità: CRITICA
       */

      const oggi = new Date('2024-02-07');
      const treGiorniFa = new Date('2024-02-04');
      const setteGiorniFa = new Date('2024-01-31');

      // Mock: GSC restituisce dati solo fino a 3 giorni fa (gap di 2 giorni)
      const mockData = {
        rows: [
          { keys: ['2024-01-31'], clicks: 100, impressions: 1000, date: '2024-01-31' },
          { keys: ['2024-02-01'], clicks: 105, impressions: 1050, date: '2024-02-01' },
          { keys: ['2024-02-02'], clicks: 110, impressions: 1100, date: '2024-02-02' },
          { keys: ['2024-02-03'], clicks: 95, impressions: 950, date: '2024-02-03' },
          { keys: ['2024-02-04'], clicks: 102, impressions: 1020, date: '2024-02-04' }
          // Nota: mancano 2024-02-05, 2024-02-06, 2024-02-07 (gap di 3 giorni)
        ]
      };

      vi.spyOn(fetcher as any, 'makeRequest').mockResolvedValue(mockData);

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: setteGiorniFa.toISOString().split('T')[0],
        endDate: oggi.toISOString().split('T')[0]
      });

      // Verifica che il sistema abbia identificato il gap
      expect(result.hasDataGap).toBe(true);
      
      // Verifica che il gap sia di almeno 2 giorni
      expect(result.gapDays).toBeGreaterThanOrEqual(2);

      // Verifica che restituisca il messaggio appropriato
      expect(result.message).toContain('Dati non ancora disponibili');
      expect(result.message).toMatch(/ultim[ie] \d+ (ore|giorni)/i);

      // Verifica che i dati mancanti NON siano stati riempiti con zeri
      const dates = result.rows.map((row: any) => row.date);
      expect(dates).not.toContain('2024-02-05');
      expect(dates).not.toContain('2024-02-06');
      expect(dates).not.toContain('2024-02-07');

      // Verifica che lastAvailableDate sia corretta
      expect(result.lastAvailableDate).toBe('2024-02-04');
    });

    it('dovrebbe calcolare correttamente le metriche escludendo il gap temporale', async () => {
      /**
       * Questo test verifica che le statistiche (media, totali) 
       * non siano falsate dai giorni mancanti
       */

      const mockData = {
        rows: [
          { keys: ['2024-02-01'], clicks: 100, impressions: 1000, date: '2024-02-01' },
          { keys: ['2024-02-02'], clicks: 100, impressions: 1000, date: '2024-02-02' },
          { keys: ['2024-02-03'], clicks: 100, impressions: 1000, date: '2024-02-03' }
          // Gap: mancano 2024-02-04, 2024-02-05, 2024-02-06, 2024-02-07
        ]
      };

      vi.spyOn(fetcher as any, 'makeRequest').mockResolvedValue(mockData);

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-02-01',
        endDate: '2024-02-07'  // 7 giorni richiesti
      });

      // La media deve essere calcolata solo sui giorni con dati (3 giorni), non su 7
      expect(result.stats.averageClicks).toBe(100);  // 300 / 3 = 100
      
      // NON dovrebbe essere 300 / 7 = 42.86 (che sarebbe sbagliato!)
      expect(result.stats.averageClicks).not.toBe(42.86);

      // Il totale deve essere corretto
      expect(result.stats.totalClicks).toBe(300);

      // Deve indicare quanti giorni sono stati effettivamente usati nel calcolo
      expect(result.stats.daysWithData).toBe(3);
      expect(result.stats.daysRequested).toBe(7);
    });

    it('NON dovrebbe segnalare gap per dati completi e recenti', async () => {
      /**
       * Test negativo: quando tutti i dati sono disponibili,
       * non deve segnalare falsi positivi
       */

      const ieri = new Date();
      ieri.setDate(ieri.getDate() - 3);  // 3 giorni fa (dati disponibili)
      
      const settimanaFa = new Date();
      settimanaFa.setDate(settimanaFa.getDate() - 10);

      const mockData = {
        rows: Array.from({ length: 7 }, (_, i) => {
          const date = new Date(settimanaFa);
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split('T')[0];
          return {
            keys: [dateStr],
            clicks: 100,
            impressions: 1000,
            date: dateStr
          };
        })
      };

      vi.spyOn(fetcher as any, 'makeRequest').mockResolvedValue(mockData);

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: settimanaFa.toISOString().split('T')[0],
        endDate: ieri.toISOString().split('T')[0]
      });

      // NON deve segnalare gap quando i dati sono completi
      expect(result.hasDataGap).toBe(false);
      expect(result.gapDays).toBe(0);
      expect(result.message).toBeUndefined();
    });
  });

  describe('2.3 Test Discrepanza Fuso Orario', () => {
    it('dovrebbe allineare correttamente i dati tra fuso orario PST (Google) e UTC+1 (Italia)', async () => {
      /**
       * Obiettivo: Verificare l'allineamento corretto tra fuso orario di Google (PST) e utente
       * 
       * Scenario: Utente in Italia (UTC+1), Google invia dati in PST (UTC-8)
       * Differenza: 9 ore in inverno, 10 ore in estate (DST)
       * 
       * Risultato atteso:
       * - I grafici sono allineati al giorno corretto senza sfasamenti
       * - Un evento del 5 febbraio 2024 ore 23:00 PST (6 febbraio 2024 08:00 UTC+1)
       *   deve essere registrato come 6 febbraio per l'utente italiano
       * 
       * Comportamento su fallimento:
       * - Uno sfasamento di 1 giorno rende impossibile confrontare i dati
       * 
       * Priorità: ALTA
       */

      // Mock dei dati da GSC con timestamp in PST
      // Google restituisce le date in formato YYYY-MM-DD riferite al fuso PST
      const mockDataFromGSC = {
        rows: [
          // Questi eventi sono del 5 febbraio in PST
          // Ma per l'utente italiano (UTC+1) dovrebbero essere considerati 6 febbraio
          { keys: ['2024-02-05'], clicks: 100, impressions: 1000, date: '2024-02-05' },
          { keys: ['2024-02-06'], clicks: 150, impressions: 1500, date: '2024-02-06' },
          { keys: ['2024-02-07'], clicks: 120, impressions: 1200, date: '2024-02-07' }
        ]
      };

      vi.spyOn(fetcher as any, 'makeRequest').mockResolvedValue(mockDataFromGSC);

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-02-05',
        endDate: '2024-02-07',
        timezone: 'Europe/Rome'  // UTC+1 (o UTC+2 in estate)
      });

      // Verifica che le date siano state convertite correttamente
      expect(result.rows).toHaveLength(3);
      
      // Verifica che il sistema indichi il fuso orario utilizzato
      expect(result.timezone).toBe('Europe/Rome');
      
      // Verifica che i dati siano stati normalizzati al fuso orario dell'utente
      // Opzione 1: Il sistema converte le date
      // Opzione 2: Il sistema mantiene le date PST ma avvisa l'utente
      expect(result.timezoneWarning).toBeDefined();
      expect(result.timezoneWarning).toContain('PST');
      expect(result.timezoneWarning).toContain('Europe/Rome');
    });

    it('dovrebbe gestire correttamente il cambio ora legale (DST)', async () => {
      /**
       * Test edge case: Il Daylight Saving Time (DST) cambia la differenza oraria
       * - Inverno: PST è UTC-8, Italia è UTC+1 → differenza 9 ore
       * - Estate: PDT è UTC-7, Italia è UTC+2 → differenza 9 ore (coincidenza!)
       * Ma i cambi non avvengono alla stessa data!
       */

      const mockDataFromGSC = {
        rows: [
          // Marzo 2024: periodo di transizione DST
          { keys: ['2024-03-30'], clicks: 100, impressions: 1000, date: '2024-03-30' },
          { keys: ['2024-03-31'], clicks: 110, impressions: 1100, date: '2024-03-31' },
          // In Italia DST inizia ultima domenica di marzo
          // Negli USA DST inizia seconda domenica di marzo
          { keys: ['2024-04-01'], clicks: 120, impressions: 1200, date: '2024-04-01' }
        ]
      };

      vi.spyOn(fetcher as any, 'makeRequest').mockResolvedValue(mockDataFromGSC);

      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-03-30',
        endDate: '2024-04-01',
        timezone: 'Europe/Rome'
      });

      // Verifica che il sistema gestisca correttamente la transizione DST
      expect(result.rows).toHaveLength(3);
      
      // Non dovrebbero esserci giorni duplicati o mancanti a causa del DST
      const dates = result.rows.map(row => row.date);
      const uniqueDates = new Set(dates);
      expect(uniqueDates.size).toBe(3);
      
      // Verifica che il sistema documenti come ha gestito il DST
      expect(result.dstHandling).toBeDefined();
    });

    it('dovrebbe permettere il confronto tra periodi nello stesso fuso orario', async () => {
      /**
       * Caso d'uso reale: Confrontare "prima" vs "dopo" una modifica SEO
       * Entrambi i periodi devono usare lo stesso fuso orario
       */

      const mockDataPeriod1 = {
        rows: [
          { keys: ['2024-01-01'], clicks: 100, impressions: 1000, date: '2024-01-01' },
          { keys: ['2024-01-02'], clicks: 105, impressions: 1050, date: '2024-01-02' }
        ]
      };

      const mockDataPeriod2 = {
        rows: [
          { keys: ['2024-02-01'], clicks: 150, impressions: 1500, date: '2024-02-01' },
          { keys: ['2024-02-02'], clicks: 160, impressions: 1600, date: '2024-02-02' }
        ]
      };

      // Primo periodo
      vi.spyOn(fetcher as any, 'makeRequest').mockResolvedValueOnce(mockDataPeriod1);
      
      const period1 = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-01-01',
        endDate: '2024-01-02',
        timezone: 'Europe/Rome'
      });

      // Secondo periodo
      vi.spyOn(fetcher as any, 'makeRequest').mockResolvedValueOnce(mockDataPeriod2);
      
      const period2 = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-02-01',
        endDate: '2024-02-02',
        timezone: 'Europe/Rome'
      });

      // Verifica che entrambi i periodi usino lo stesso fuso orario
      expect(period1.timezone).toBe(period2.timezone);
      
      // Dovrebbe essere possibile calcolare la differenza percentuale
      const avgClicksPeriod1 = period1.stats?.averageClicks || 0;
      const avgClicksPeriod2 = period2.stats?.averageClicks || 0;
      const percentageChange = ((avgClicksPeriod2 - avgClicksPeriod1) / avgClicksPeriod1) * 100;
      
      // In questo esempio: da 102.5 a 155 = +51.2%
      expect(percentageChange).toBeCloseTo(51.2, 1);
    });

    it('dovrebbe fornire un warning se il fuso orario non è specificato', async () => {
      /**
       * Scenario: L'utente non specifica il fuso orario
       * Il sistema dovrebbe usare un default ragionevole e avvisare
       */

      const mockData = {
        rows: [
          { keys: ['2024-02-01'], clicks: 100, impressions: 1000, date: '2024-02-01' }
        ]
      };

      vi.spyOn(fetcher as any, 'makeRequest').mockResolvedValue(mockData);

      // Fetch SENZA specificare timezone
      const result = await fetcher.fetchSearchAnalytics({
        siteUrl: 'https://example.com',
        startDate: '2024-02-01',
        endDate: '2024-02-01'
        // timezone non specificato
      });

      // Dovrebbe usare un default (es. UTC o il fuso del server)
      expect(result.timezone).toBeDefined();
      
      // Dovrebbe avvisare l'utente
      expect(result.timezoneWarning).toContain('default');
      expect(result.timezoneWarning).toMatch(/UTC|default|non specificato/i);
    });
  });
});
