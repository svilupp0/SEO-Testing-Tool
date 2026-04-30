export interface AnalysisConfig {
  /** Soglia p-value sotto la quale il risultato è significativo (default: 0.05) */
  significanceLevel: number;
  /** Minimo click/giorno medio richiesto in entrambi i periodi (default: 50) */
  minimumDataThreshold: number;
  /** Moltiplicatore IQR per rilevamento outlier. 3.0 = conservativo, 1.5 = aggressivo (default: 3.0) */
  outlierIqrMultiplier: number;
  /** Minimo numero di data point per periodo richiesto per il t-test (default: 7) */
  minimumSampleSize: number;
}

export const DEFAULT_ANALYSIS_CONFIG: Readonly<AnalysisConfig> = {
  significanceLevel: 0.05,
  minimumDataThreshold: 50,
  outlierIqrMultiplier: 3.0,
  minimumSampleSize: 7,
};

export function createAnalysisConfig(
  overrides?: Partial<AnalysisConfig>
): AnalysisConfig {
  return { ...DEFAULT_ANALYSIS_CONFIG, ...overrides };
}
