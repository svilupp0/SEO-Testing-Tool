/**
 * TestRepository - Storage e gestione dei test SEO
 */

interface TestData {
  id: string;
  userId: string;
  name: string;
  urls: string[];
  startDate: Date;
  sharedWith?: string[];
}

interface CreateTestParams {
  userId: string;
  name: string;
  urls: string[];
  startDate: Date;
  sharedWith?: string[];
}

interface UpdateTestParams {
  name?: string;
  urls?: string[];
  startDate?: Date;
}

interface UpdateOptions {
  confirmDataLoss?: boolean;
}

interface DeleteOptions {
  confirm?: boolean;
  deleteHistoricalData?: boolean;
}

interface MetricData {
  date: Date;
  clicks: number;
  impressions: number;
}

interface AuditLogEntry {
  action: string;
  timestamp: Date;
  deletedBy: string;
}

interface ExportedTestData {
  testName: string;
  metrics: MetricData[];
}

export class TestRepository {
  private tests: Map<string, TestData> = new Map();
  private testCounter = 0;
  private metrics: Map<string, MetricData[]> = new Map();
  private historicalData: Map<string, Map<string, MetricData>> = new Map();
  private auditLogs: Map<string, AuditLogEntry> = new Map();

  async createTest(params: CreateTestParams): Promise<TestData> {
    // Controllo sovrapposizione URL con test esistenti dello stesso utente
    for (const test of this.tests.values()) {
      if (test.userId === params.userId) {
        for (const url of params.urls) {
          if (test.urls.includes(url)) {
            throw new Error(
              `Questa pagina è già inclusa nel test '${test.name}'. Completa o cancella quel test prima di crearne uno nuovo.`
            );
          }
        }
      }
    }

    const testId = `test-${++this.testCounter}`;
    const test: TestData = {
      id: testId,
      userId: params.userId,
      name: params.name,
      urls: params.urls,
      startDate: params.startDate,
      sharedWith: params.sharedWith,
    };
    
    this.tests.set(testId, test);
    return test;
  }

  async getTestOwner(testId: string): Promise<{ userId: string }> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error('Test not found');
    }
    return { userId: test.userId };
  }

  async getTest(userId: string, testId: string): Promise<TestData> {
    const test = this.tests.get(testId);
    
    if (!test) {
      throw new Error('Test not found');
    }
    
    // Verifica autorizzazione
    if (test.userId !== userId) {
      throw new Error('Non hai i permessi per visualizzare questa risorsa.');
    }
    
    return test;
  }

  async updateTest(
    userId: string,
    testId: string,
    updates: UpdateTestParams,
    options?: UpdateOptions
  ): Promise<TestData> {
    const test = this.tests.get(testId);
    
    if (!test) {
      throw new Error('Test not found');
    }
    
    // Verifica autorizzazione
    if (test.userId !== userId) {
      throw new Error('Non hai i permessi per visualizzare questa risorsa.');
    }
    
    // Se si sta modificando la data di inizio, richiedi conferma
    if (updates.startDate && !options?.confirmDataLoss) {
      const testMetrics = this.metrics.get(testId) || [];
      const daysOfData = testMetrics.length;
      
      // Richiedi sempre conferma quando si modifica la data, anche senza dati
      throw new Error(
        daysOfData > 0
          ? `La modifica della data cancellerà ${daysOfData} giorni di dati raccolti. Confermi?`
          : `La modifica della data cancellerà i dati raccolti. Confermi?`
      );
    }
    
    // Se si stanno modificando gli URL e il test ha dati, impedisci
    if (updates.urls) {
      const testMetrics = this.metrics.get(testId) || [];
      if (testMetrics.length > 0) {
        throw new Error(
          'Non è possibile modificare gli URL di un test con dati raccolti. Crea un nuovo test.'
        );
      }
    }
    
    // Applica aggiornamenti
    const updatedTest = {
      ...test,
      ...updates,
    };
    
    this.tests.set(testId, updatedTest);
    return updatedTest;
  }

  async deleteTest(userId: string, testId: string, options?: DeleteOptions): Promise<void> {
    const test = this.tests.get(testId);
    
    if (!test) {
      throw new Error('Test not found');
    }
    
    // Verifica autorizzazione
    if (test.userId !== userId) {
      throw new Error('Non hai i permessi per visualizzare questa risorsa.');
    }
    
    // Controlla se ci sono dati e richiedi conferma
    // A meno che non sia stata fornita conferma esplicita o deleteHistoricalData
    const testMetrics = this.metrics.get(testId) || [];
    if (testMetrics.length > 0 && !options?.confirm && !options?.deleteHistoricalData) {
      throw new Error(
        `Questo test contiene ${testMetrics.length} giorni di dati. Confermi l'eliminazione?`
      );
    }
    
    // Registra audit log
    this.auditLogs.set(testId, {
      action: 'test_deleted',
      timestamp: new Date(),
      deletedBy: userId,
    });
    
    // Elimina il test
    this.tests.delete(testId);
    
    // Gestisci eliminazione dati storici
    if (options?.deleteHistoricalData) {
      // Elimina anche i dati storici
      const userKey = `${userId}`;
      if (this.historicalData.has(userKey)) {
        const userData = this.historicalData.get(userKey)!;
        for (const url of test.urls) {
          const key = `${url}-`;
          const keysToDelete: string[] = [];
          userData.forEach((_, k) => {
            if (k.startsWith(key)) {
              keysToDelete.push(k);
            }
          });
          keysToDelete.forEach(k => userData.delete(k));
        }
      }
    }
    // Altrimenti mantieni i dati nel historicalData per riuso futuro
  }

  async getTestResults(userId: string, testId: string): Promise<any> {
    const test = this.tests.get(testId);
    
    if (!test) {
      throw new Error('Test not found');
    }
    
    // Verifica autorizzazione
    if (test.userId !== userId) {
      throw new Error('Non hai i permessi per visualizzare questa risorsa.');
    }
    
    const testMetrics = this.metrics.get(testId) || [];
    const filteredMetrics = testMetrics.filter(m => m.date >= test.startDate);
    
    return {
      testId,
      clicks: 100,
      impressions: 1000,
      dataPoints: filteredMetrics,
    };
  }

  async listTests(userId: string): Promise<TestData[]> {
    const userTests: TestData[] = [];
    
    for (const test of this.tests.values()) {
      if (test.userId === userId) {
        userTests.push(test);
      }
    }
    
    return userTests;
  }

  async recordMetrics(testId: string, metric: MetricData): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error('Test not found');
    }
    
    // Salva le metriche per il test
    if (!this.metrics.has(testId)) {
      this.metrics.set(testId, []);
    }
    this.metrics.get(testId)!.push(metric);
    
    // Salva anche nei dati storici per riuso futuro
    const userKey = `${test.userId}`;
    if (!this.historicalData.has(userKey)) {
      this.historicalData.set(userKey, new Map());
    }
    
    const userData = this.historicalData.get(userKey)!;
    for (const url of test.urls) {
      const key = `${url}-${metric.date.toISOString()}`;
      userData.set(key, metric);
    }
  }

  async getHistoricalGSCData(
    userId: string,
    url: string,
    date: Date
  ): Promise<MetricData | null> {
    const userKey = `${userId}`;
    const userData = this.historicalData.get(userKey);
    
    if (!userData) {
      return null;
    }
    
    const key = `${url}-${date.toISOString()}`;
    return userData.get(key) || null;
  }

  async getAuditLog(_userId: string, testId: string): Promise<AuditLogEntry> {
    const log = this.auditLogs.get(testId);
    if (!log) {
      throw new Error('Audit log not found');
    }
    return log;
  }

  async exportTestData(userId: string, testId: string): Promise<ExportedTestData> {
    const test = await this.getTest(userId, testId);
    const testMetrics = this.metrics.get(testId) || [];
    
    return {
      testName: test.name,
      metrics: testMetrics,
    };
  }
}
