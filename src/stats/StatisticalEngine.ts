import {
  AnalysisConfig,
  DEFAULT_ANALYSIS_CONFIG,
} from '../config/AnalysisConfig.js';
import { twoTailedPValue } from './TDistribution.js';

export interface AnalysisInput {
  before: number[];
  after: number[];
  seasonalityAware?: boolean;
  startDayOfWeek?: { before: number; after: number };
  controlGroup?: {
    before: number[];
    after: number[];
  };
}

export interface Outlier {
  value: number;
  index: number;
  period: 'before' | 'after';
}

export interface AnalysisResult {
  pValue: number;
  isSignificant: boolean;
  message: string;
  percentageChange: number;
  hasInsufficientData: boolean;
  outliersDetected: boolean;
  outliers: Outlier[];
  meanAfterOutlierRemoval: number;
  seasonalityDetected: boolean;
  seasonalityPeriod: number | null;
  relativePerformance?: number;
  controlGroupPerformance?: number;
  tStatistic?: number;
  degreesOfFreedom?: number;
}

export class StatisticalEngine {
  private readonly config: AnalysisConfig;

  constructor(config?: Partial<AnalysisConfig>) {
    this.config = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
  }

  analyze(input: AnalysisInput): AnalysisResult {
    const {
      before,
      after,
      seasonalityAware = false,
      startDayOfWeek,
      controlGroup,
    } = input;

    // Rileva stagionalità se richiesto
    const seasonalityInfo = seasonalityAware
      ? this.detectSeasonality(before)
      : { detected: false, period: null };

    // Allinea i dati se c'è un offset nei giorni della settimana
    let alignedBefore = before;
    let alignedAfter = after;

    if (seasonalityAware && startDayOfWeek) {
      const offset = (startDayOfWeek.after - startDayOfWeek.before + 7) % 7;
      if (offset !== 0 && after.length >= offset) {
        // Allinea "after" a "before" ruotando i dati
        alignedAfter = [...after.slice(offset), ...after.slice(0, offset)];
      }
    }

    // Rileva outlier prima di calcolare le statistiche
    const outliersBefore = this.detectOutliers(alignedBefore, 'before');
    const outliersAfter = this.detectOutliers(alignedAfter, 'after');
    const allOutliers = [...outliersBefore, ...outliersAfter];
    const outliersDetected = allOutliers.length > 0;

    // Rimuovi outlier per calcolare statistiche pulite
    const cleanBefore = this.removeOutliers(alignedBefore, outliersBefore);
    const cleanAfter = this.removeOutliers(alignedAfter, outliersAfter);

    // Seleziona dati da usare per il calcolo
    const dataBefore = cleanBefore.length > 0 ? cleanBefore : alignedBefore;
    const dataAfter = cleanAfter.length > 0 ? cleanAfter : alignedAfter;

    // Calcola medie
    const meanBefore = this.calculateMean(dataBefore);
    const meanAfter = this.calculateMean(dataAfter);
    const meanAfterOutlierRemoval = meanAfter;

    // Calcola variazione percentuale
    const percentageChange =
      meanBefore !== 0 ? ((meanAfter - meanBefore) / meanBefore) * 100 : 0;

    // Calcola performance relativa se c'è un gruppo di controllo
    let relativePerformance: number | undefined;
    let controlGroupPerformance: number | undefined;

    if (controlGroup) {
      const controlMeanBefore = this.calculateMean(controlGroup.before);
      const controlMeanAfter = this.calculateMean(controlGroup.after);
      controlGroupPerformance =
        ((controlMeanAfter - controlMeanBefore) / controlMeanBefore) * 100;

      // Performance relativa = differenza tra test e controllo
      relativePerformance = percentageChange - controlGroupPerformance;
    }

    // Verifica dati insufficienti: volume troppo basso o campione troppo piccolo
    const hasInsufficientData =
      meanBefore < this.config.minimumDataThreshold ||
      meanAfter < this.config.minimumDataThreshold ||
      dataBefore.length < this.config.minimumSampleSize ||
      dataAfter.length < this.config.minimumSampleSize;

    // Determina significatività e messaggio
    let isSignificant = false;
    let pValue = 1.0;
    let tStatistic: number | undefined;
    let degreesOfFreedom: number | undefined;
    let message = 'Nessun cambiamento significativo rilevato.';

    if (hasInsufficientData) {
      message =
        'Dati insufficienti per determinare significatività statistica. Continua il test.';
    } else {
      // Welch's t-test reale
      const tTestResult = this.welchTTest(dataBefore, dataAfter);
      pValue = tTestResult.pValue;
      tStatistic = tTestResult.tStatistic;
      degreesOfFreedom = tTestResult.degreesOfFreedom;

      isSignificant = pValue < this.config.significanceLevel;

      if (relativePerformance !== undefined) {
        // Messaggio basato su performance relativa
        if (isSignificant) {
          if (relativePerformance > 0) {
            message =
              'Le pagine del test hanno performato meglio del resto del sito.';
          } else {
            message =
              'Le pagine del test hanno performato peggio del resto del sito.';
          }
        } else {
          message = 'Nessun cambiamento significativo rilevato.';
        }
      } else {
        // Messaggio classico
        message = isSignificant
          ? 'Cambiamento significativo rilevato.'
          : 'Nessun cambiamento significativo rilevato.';
      }
    }

    return {
      pValue,
      isSignificant,
      message,
      percentageChange,
      hasInsufficientData,
      outliersDetected,
      outliers: allOutliers,
      meanAfterOutlierRemoval,
      seasonalityDetected: seasonalityInfo.detected,
      seasonalityPeriod: seasonalityInfo.period,
      relativePerformance,
      controlGroupPerformance,
      tStatistic,
      degreesOfFreedom,
    };
  }

  private welchTTest(
    sample1: number[],
    sample2: number[]
  ): { tStatistic: number; degreesOfFreedom: number; pValue: number } {
    const n1 = sample1.length;
    const n2 = sample2.length;
    const mean1 = this.calculateMean(sample1);
    const mean2 = this.calculateMean(sample2);
    const var1 = this.calculateVariance(sample1, mean1);
    const var2 = this.calculateVariance(sample2, mean2);

    // Edge case: entrambe le varianze sono zero
    if (var1 === 0 && var2 === 0) {
      if (mean1 === mean2) {
        return { tStatistic: 0, degreesOfFreedom: n1 + n2 - 2, pValue: 1.0 };
      }
      // Medie diverse con varianza zero = separazione perfetta
      return {
        tStatistic: mean2 > mean1 ? Infinity : -Infinity,
        degreesOfFreedom: n1 + n2 - 2,
        pValue: 0.0,
      };
    }

    const se1 = var1 / n1;
    const se2 = var2 / n2;
    const seSum = se1 + se2;

    const tStat = (mean2 - mean1) / Math.sqrt(seSum);

    // Gradi di libertà Welch-Satterthwaite
    let df: number;
    if (se1 === 0 || se2 === 0) {
      // Una varianza è zero: usa l'altro campione per i df
      df = (se1 === 0 ? n2 : n1) - 1;
    } else {
      df = (seSum * seSum) / ((se1 * se1) / (n1 - 1) + (se2 * se2) / (n2 - 1));
    }

    const effectiveDf = Math.max(df, 1);
    const pVal = twoTailedPValue(tStat, effectiveDf);

    return { tStatistic: tStat, degreesOfFreedom: effectiveDf, pValue: pVal };
  }

  private calculateVariance(values: number[], mean?: number): number {
    if (values.length < 2) return 0;
    const m = mean ?? this.calculateMean(values);
    const sumSquaredDiffs = values.reduce(
      (acc, val) => acc + (val - m) ** 2,
      0
    );
    return sumSquaredDiffs / (values.length - 1); // Correzione di Bessel
  }

  private detectSeasonality(values: number[]): {
    detected: boolean;
    period: number | null;
  } {
    // Rileva pattern settimanale (periodo 7)
    if (values.length < 14) {
      return { detected: false, period: null };
    }

    // Calcola autocorrelazione per periodo 7
    const period = 7;
    let correlation = 0;
    let count = 0;

    for (let i = 0; i < values.length - period; i++) {
      correlation += Math.abs(values[i] - values[i + period]);
      count++;
    }

    const avgDiff = correlation / count;
    const overallMean = this.calculateMean(values);

    // Se la differenza media tra giorni distanti 7 è piccola rispetto alla media,
    // c'è un pattern settimanale
    const threshold = overallMean * 0.3;

    if (avgDiff < threshold) {
      return { detected: true, period: 7 };
    }

    return { detected: false, period: null };
  }

  private detectOutliers(
    values: number[],
    period: 'before' | 'after'
  ): Outlier[] {
    const outliers: Outlier[] = [];

    // Usa metodo IQR (Interquartile Range)
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q3 = this.percentile(sorted, 75);
    const iqr = q3 - q1;

    // Soglie per outlier configurabili
    const lowerBound = q1 - this.config.outlierIqrMultiplier * iqr;
    const upperBound = q3 + this.config.outlierIqrMultiplier * iqr;

    values.forEach((value, index) => {
      if (value < lowerBound || value > upperBound) {
        outliers.push({ value, index, period });
      }
    });

    return outliers;
  }

  private removeOutliers(values: number[], outliers: Outlier[]): number[] {
    const outlierIndices = new Set(outliers.map((o) => o.index));
    return values.filter((_, index) => !outlierIndices.has(index));
  }

  private percentile(sortedValues: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }
}
