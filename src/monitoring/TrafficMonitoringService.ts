/**
 * TrafficMonitoringService
 *
 * Monitora traffico e rileva anomalie:
 * - Zero traffic detection
 * - Sospensione test inattivi
 * - Recovery automatico
 * - Tracking downtime
 */

interface GSCData {
  url: string;
  clicks: number;
  impressions: number;
  date: Date;
}

interface ZeroTrafficDetection {
  hasZeroTraffic: boolean;
  consecutiveDays: number;
  lastTrafficDate: Date | null;
  reason?: string;
}

interface TestStatus {
  testId: string;
  status: 'active' | 'suspended';
  reason?: string;
  suspendedAt?: Date;
}

interface RecoveryDetection {
  hasRecovered: boolean;
  recoveryDate: Date;
  trafficResumed: boolean;
}

interface DowntimeRecord {
  testId: string;
  downtimeStart: Date;
  downtimeEnd: Date | null;
  durationDays: number;
  consecutiveDays: number;
  reason: string;
  cause?: string;
}

export class TrafficMonitoringService {
  private testStatuses: Map<string, TestStatus> = new Map();
  private trafficHistory: Map<string, GSCData[]> = new Map();
  private downtimeRecords: Map<string, DowntimeRecord[]> = new Map();

  /**
   * Test 7.3 - Rileva zero traffic
   */
  async detectZeroTraffic(testId: string, gscData: GSCData[]): Promise<ZeroTrafficDetection> {
    // Conta giorni consecutivi con zero traffic
    let consecutiveDays = 0;
    let lastTrafficDate: Date | null = null;

    const sortedData = [...gscData].sort((a, b) => b.date.getTime() - a.date.getTime());

    for (const data of sortedData) {
      if (data.clicks === 0 && data.impressions === 0) {
        consecutiveDays++;
      } else {
        lastTrafficDate = data.date;
        break;
      }
    }

    const hasZeroTraffic = consecutiveDays >= 7; // Soglia: 7 giorni

    const detection: ZeroTrafficDetection = {
      hasZeroTraffic,
      consecutiveDays,
      lastTrafficDate,
    };

    if (hasZeroTraffic) {
      detection.reason = 'No traffic for 7+ consecutive days';
    }

    return detection;
  }

  /**
   * Test 7.3 - Sospende test con zero traffic
   */
  async suspendTest(testId: string, reason: string): Promise<TestStatus> {
    const status: TestStatus = {
      testId,
      status: 'suspended',
      reason,
      suspendedAt: new Date(),
    };

    this.testStatuses.set(testId, status);

    // Registra downtime
    await this.recordDowntime(testId, reason);

    return status;
  }

  /**
   * Test 7.3 - Registra downtime (overload per eventi specifici)
   */
  async recordDowntime(
    testId: string,
    propertyOrReason: string,
    downtimeEvent?: {
      startDate: string;
      endDate: string;
      consecutiveDays: number;
      cause: string;
    }
  ): Promise<void> {
    const records = this.downtimeRecords.get(testId) || [];

    if (downtimeEvent) {
      // Chiamata con evento specifico
      records.push({
        testId,
        downtimeStart: new Date(downtimeEvent.startDate),
        downtimeEnd: new Date(downtimeEvent.endDate),
        durationDays: downtimeEvent.consecutiveDays,
        consecutiveDays: downtimeEvent.consecutiveDays,
        reason: downtimeEvent.cause,
        cause: downtimeEvent.cause,
      });
    } else {
      // Chiamata semplice (reason = propertyOrReason)
      records.push({
        testId,
        downtimeStart: new Date(),
        downtimeEnd: null,
        durationDays: 0,
        consecutiveDays: 0,
        reason: propertyOrReason,
      });
    }

    this.downtimeRecords.set(testId, records);
  }

  /**
   * Test 7.3 - Recupera stato test
   */
  async getTestStatus(testId: string): Promise<TestStatus> {
    return (
      this.testStatuses.get(testId) || {
        testId,
        status: 'active',
      }
    );
  }

  /**
   * Test 7.3 - NON deve contare giorni sospesi nel calcolo statistical power
   */
  async getActiveDaysCount(testId: string, totalDays: number): Promise<number> {
    const downtimeRecords = this.downtimeRecords.get(testId) || [];

    let suspendedDays = 0;
    for (const record of downtimeRecords) {
      if (record.downtimeEnd) {
        const duration =
          (record.downtimeEnd.getTime() - record.downtimeStart.getTime()) / (1000 * 60 * 60 * 24);
        suspendedDays += Math.floor(duration);
      }
    }

    return totalDays - suspendedDays;
  }

  /**
   * Test 7.3 - Rileva recovery automatico
   */
  async detectRecovery(testId: string, gscData: GSCData[]): Promise<RecoveryDetection> {
    // Verifica se c'è traffico recente
    const recentData = gscData.filter(
      (d) => d.date.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    const hasTraffic = recentData.some((d) => d.clicks > 0 || d.impressions > 0);

    const detection: RecoveryDetection = {
      hasRecovered: hasTraffic,
      recoveryDate: new Date(),
      trafficResumed: hasTraffic,
    };

    return detection;
  }

  /**
   * Test 7.3 - Riprendi test sospeso
   */
  async resumeTest(testId: string): Promise<TestStatus> {
    const status: TestStatus = {
      testId,
      status: 'active',
    };

    this.testStatuses.set(testId, status);

    // Chiudi downtime record
    const records = this.downtimeRecords.get(testId) || [];
    if (records.length > 0) {
      const lastRecord = records[records.length - 1];
      if (!lastRecord.downtimeEnd) {
        lastRecord.downtimeEnd = new Date();
        lastRecord.durationDays = Math.floor(
          (lastRecord.downtimeEnd.getTime() - lastRecord.downtimeStart.getTime()) /
            (1000 * 60 * 60 * 24)
        );
      }
    }

    return status;
  }

  /**
   * Test 7.3 - Invia alert zero traffic
   */
  async sendZeroTrafficAlert(testId: string, detection: ZeroTrafficDetection): Promise<boolean> {
    if (!detection.hasZeroTraffic) {
      return false;
    }

    // Qui invieremmo realmente l'alert
    return true;
  }

  /**
   * Test 7.3 - Recupera downtime records
   */
  async getDowntimeRecords(testId: string): Promise<DowntimeRecord[]> {
    return this.downtimeRecords.get(testId) || [];
  }

  /**
   * Test 7.3 - Conta sospensioni totali
   */
  async countSuspensions(testId: string): Promise<number> {
    const records = this.downtimeRecords.get(testId) || [];
    return records.length;
  }

  /**
   * Test 7.3 - Analizza traffico per rilevare anomalie
   */
  async analyzeTraffic(
    testId: string,
    trafficData: Array<{ date: string; clicks: number; impressions: number; ctr?: number; position?: number }>
  ): Promise<{
    isZeroTraffic: boolean;
    consecutiveZeroDays: number;
    sitePossiblyOffline: boolean;
    lowTraffic?: boolean;
    possibleCause?: string;
  }> {
    let consecutiveZeroDays = 0;

    // Conta giorni consecutivi con zero traffic
    for (const day of trafficData) {
      if (day.clicks === 0 && day.impressions === 0) {
        consecutiveZeroDays++;
      } else {
        break;
      }
    }

    const isZeroTraffic = consecutiveZeroDays >= 7;
    const sitePossiblyOffline = isZeroTraffic;

    // Controlla se è traffico basso (non zero)
    const hasLowTraffic =
      trafficData.length > 0 &&
      trafficData.every((d) => d.clicks > 0 && d.clicks < 5 && d.impressions < 50);

    return {
      isZeroTraffic,
      consecutiveZeroDays,
      sitePossiblyOffline,
      lowTraffic: hasLowTraffic,
      possibleCause: hasLowTraffic ? 'seasonal_or_legitimate_drop' : undefined,
    };
  }

  /**
   * Test 7.3 - Gestisce situazione zero traffic
   */
  async handleZeroTraffic(
    testId: string,
    property: string,
    zeroTrafficData: { consecutiveZeroDays: number; sitePossiblyOffline: boolean }
  ): Promise<{
    action: string;
    affectedTests: string[];
    reason: string;
  }> {
    if (zeroTrafficData.sitePossiblyOffline) {
      // Sospendi test
      await this.suspendTest(testId, 'site_possibly_offline');

      return {
        action: 'suspend_tests',
        affectedTests: [testId],
        reason: 'site_possibly_offline',
      };
    }

    return {
      action: 'monitor',
      affectedTests: [],
      reason: 'no_action_needed',
    };
  }

  /**
   * Test 7.3 - Genera alert zero traffic
   */
  async generateZeroTrafficAlert(
    testId: string,
    property: string,
    consecutiveDays: number
  ): Promise<{
    severity: string;
    message: string;
    action: string;
  }> {
    let message = `⚠️ Nessun traffico rilevato da ${consecutiveDays} giorni\n\n`;
    message += `Proprietà: ${property}\n\n`;
    message += `Il sito potrebbe essere offline o inaccessibile.\n`;
    message += `I test sono sospesi fino a quando il traffico non ritorna.\n`;

    return {
      severity: 'critical',
      message,
      action: 'verify_site_status',
    };
  }

  /**
   * Test 7.3 - Analizza risultati test (NON dichiara peggioramento se sito offline)
   */
  async analyzeTestResults(
    testId: string,
    testResults: {
      beforePeriod: { avgClicks: number; avgImpressions: number };
      afterPeriod: { avgClicks: number; avgImpressions: number };
      consecutiveZeroDays: number;
    }
  ): Promise<{
    testStatus: string;
    validResult: boolean;
    reason: string;
  }> {
    // Se sito offline, NON dichiarare peggioramento
    if (
      testResults.afterPeriod.avgClicks === 0 &&
      testResults.afterPeriod.avgImpressions === 0 &&
      testResults.consecutiveZeroDays >= 7
    ) {
      return {
        testStatus: 'suspended_zero_traffic',
        validResult: false,
        reason: 'site_offline_suspected',
      };
    }

    // Normale analisi
    return {
      testStatus: 'valid',
      validResult: true,
      reason: 'normal_traffic',
    };
  }

  /**
   * Test 7.3 - Verifica recovery traffico
   */
  async checkTrafficRecovery(
    testId: string,
    property: string,
    trafficData: Array<{ date: string; clicks: number; impressions: number }>
  ): Promise<{
    trafficRecovered: boolean;
    action: string;
    resumeDate?: string;
  }> {
    // Verifica se c'è traffico recente
    const hasRecentTraffic = trafficData.some((d) => d.clicks > 0 || d.impressions > 0);

    if (hasRecentTraffic) {
      return {
        trafficRecovered: true,
        action: 'resume_tests',
        resumeDate: new Date().toISOString(),
      };
    }

    return {
      trafficRecovered: false,
      action: 'continue_monitoring',
    };
  }

  /**
   * Test 7.3 - Richiede sospensione test (con conferma utente)
   */
  async requestTestSuspension(
    testId: string,
    property: string,
    zeroTrafficData: { consecutiveZeroDays: number; sitePossiblyOffline: boolean }
  ): Promise<{
    requiresUserConfirmation: boolean;
    message: string;
    options: string[];
  }> {
    let message = `⚠️ Rilevato zero traffic per ${zeroTrafficData.consecutiveZeroDays} giorni\n\n`;
    message += `Proprietà: ${property}\n\n`;
    message += `Confermi la sospensione dei test?\n`;

    return {
      requiresUserConfirmation: true,
      message,
      options: ['suspend', 'verify_manually', 'continue_monitoring'],
    };
  }

  /**
   * Test 7.3 - Recupera storia downtime
   */
  async getDowntimeHistory(testId: string): Promise<DowntimeRecord[]> {
    return this.downtimeRecords.get(testId) || [];
  }
}
