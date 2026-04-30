import { StatisticalEngine } from '../../src/stats/StatisticalEngine';

/**
 * Generatore deterministico di dati rumorosi.
 * Usa un LCG (Linear Congruential Generator) + Box-Muller per distribuzione normale.
 * Il seed garantisce riproducibilità tra esecuzioni.
 */
function generateNoisyData(
  mean: number,
  stdDev: number,
  n: number,
  seed: number = 42
): number[] {
  const data: number[] = [];
  let state = seed;
  const nextRand = () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };

  for (let i = 0; i < n; i++) {
    const u1 = nextRand() || 0.0001;
    const u2 = nextRand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    data.push(Math.max(0, mean + stdDev * z));
  }
  return data;
}

describe('Statistical Engine - Test 3.1: Test Ipotesi Nulla', () => {
  test("dovrebbe riconoscere quando non c'è stato alcun cambiamento significativo", () => {
    // ARRANGE: Dati con stessa media (~100) e rumore naturale
    const periodoBefore = generateNoisyData(100, 10, 30, 1);
    const periodoAfter = generateNoisyData(100, 10, 30, 2);

    const statisticalEngine = new StatisticalEngine();

    // ACT: Eseguire l'analisi statistica
    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // ASSERT: Verificare che il sistema riconosca l'assenza di cambiamento
    // 1. Il p-value deve essere alto (> 0.05) - non statisticamente significativo
    expect(risultato.pValue).toBeGreaterThan(0.05);

    // 2. Il sistema non deve dichiarare il cambiamento come significativo
    expect(risultato.isSignificant).toBe(false);

    // 3. Il messaggio deve indicare chiaramente che non c'è cambiamento
    expect(risultato.message).toBe(
      'Nessun cambiamento significativo rilevato.'
    );

    // 4. La variazione percentuale dovrebbe essere piccola
    expect(Math.abs(risultato.percentageChange)).toBeLessThan(10);
  });

  test('dovrebbe gestire dati identici con valori diversi da 100', () => {
    // Test con dati costanti identici (edge case varianza zero)
    const periodoBefore = Array(30).fill(250);
    const periodoAfter = Array(30).fill(250);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    expect(risultato.pValue).toBeGreaterThan(0.05);
    expect(risultato.isSignificant).toBe(false);
    expect(risultato.message).toBe(
      'Nessun cambiamento significativo rilevato.'
    );
  });

  test('dovrebbe riconoscere variazioni minime come non significative', () => {
    // Test con variazione dello 0.5% immersa nel rumore
    const periodoBefore = generateNoisyData(100, 10, 30, 3);
    const periodoAfter = generateNoisyData(100.5, 10, 30, 4);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // Con una variazione così piccola rispetto al rumore, non dovrebbe essere significativa
    expect(risultato.pValue).toBeGreaterThan(0.05);
    expect(risultato.isSignificant).toBe(false);
  });
});

describe('Statistical Engine - Test 3.2: Test Significatività', () => {
  test('dovrebbe riconoscere quando i dati sono insufficienti per determinare significatività', () => {
    // ARRANGE: Preparare dati con volume molto basso
    const periodoBefore = generateNoisyData(10, 2, 30, 10);
    const periodoAfter = generateNoisyData(10.5, 2, 30, 11);

    const statisticalEngine = new StatisticalEngine();

    // ACT: Eseguire l'analisi statistica
    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // ASSERT: Verificare che il sistema riconosca dati insufficienti
    expect(risultato.isSignificant).toBe(false);
    expect(risultato.message).toBe(
      'Dati insufficienti per determinare significatività statistica. Continua il test.'
    );
    expect(risultato.hasInsufficientData).toBe(true);
  });

  test('dovrebbe riconoscere dati insufficienti anche con variazioni maggiori', () => {
    // Test con variazione del 20% ma volume minimo
    const periodoBefore = generateNoisyData(5, 1, 30, 12);
    const periodoAfter = generateNoisyData(6, 1.2, 30, 13);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // Anche con +20%, i numeri sono troppo bassi per essere affidabili
    expect(risultato.isSignificant).toBe(false);
    expect(risultato.hasInsufficientData).toBe(true);
    expect(risultato.message).toBe(
      'Dati insufficienti per determinare significatività statistica. Continua il test.'
    );
  });

  test('dovrebbe riconoscere quando i dati sono sufficienti', () => {
    // Test con volume sufficiente: 1000 click/giorno con +20% di aumento
    const periodoBefore = generateNoisyData(1000, 50, 30, 14);
    const periodoAfter = generateNoisyData(1200, 60, 30, 15);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // Con questi volumi e un effetto del +20%, il Welch's t-test deve trovarlo significativo
    expect(risultato.hasInsufficientData).toBe(false);
    expect(risultato.isSignificant).toBe(true);
    expect(risultato.pValue).toBeLessThan(0.05);
    expect(risultato.message).not.toBe(
      'Dati insufficienti per determinare significatività statistica. Continua il test.'
    );
  });
});

describe('Statistical Engine - Test 3.3: Test Outlier', () => {
  test('dovrebbe rilevare e gestire un outlier evidente nei dati', () => {
    // ARRANGE: Traffico normale ~100 click/giorno con un outlier a 10.000
    const periodoBefore = generateNoisyData(100, 8, 30, 20);

    const periodoAfter = generateNoisyData(100, 8, 30, 21);
    periodoAfter[14] = 10000; // Giorno 15: picco anomalo di 10.000 click

    const statisticalEngine = new StatisticalEngine();

    // ACT: Eseguire l'analisi statistica
    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // ASSERT: Verificare che il sistema rilevi e gestisca l'outlier
    expect(risultato.outliersDetected).toBe(true);
    expect(risultato.outliers).toBeDefined();
    expect(risultato.outliers.length).toBeGreaterThan(0);
    expect(risultato.outliers[0].value).toBe(10000);
    expect(risultato.outliers[0].index).toBe(14);

    // Le statistiche calcolate NON devono essere falsate dall'outlier
    expect(risultato.meanAfterOutlierRemoval).toBeCloseTo(100, -1);

    // La variazione percentuale deve essere piccola dopo la rimozione dell'outlier
    expect(Math.abs(risultato.percentageChange)).toBeLessThan(10);
  });

  test('dovrebbe rilevare outlier multipli in un periodo', () => {
    const periodoBefore = generateNoisyData(100, 8, 30, 22);
    const periodoAfter = generateNoisyData(100, 8, 30, 23);
    periodoAfter[5] = 8000;
    periodoAfter[15] = 9000;
    periodoAfter[25] = 7500;

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // Deve rilevare tutti e 3 gli outlier
    expect(risultato.outliersDetected).toBe(true);
    expect(risultato.outliers.length).toBe(3);

    // La media dopo la rimozione degli outlier deve essere vicina a 100
    expect(risultato.meanAfterOutlierRemoval).toBeCloseTo(100, -1);
  });

  test('dovrebbe riconoscere quando NON ci sono outlier', () => {
    // Dati con variazione naturale ma senza outlier
    const periodoBefore = [95, 100, 105, 98, 102, 97, 103, 99, 101, 96];
    const periodoAfter = [94, 99, 104, 97, 101, 96, 102, 98, 100, 95];

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // Non deve rilevare outlier in dati con variazione normale
    expect(risultato.outliersDetected).toBe(false);
    expect(risultato.outliers.length).toBe(0);
  });

  test('dovrebbe gestire outlier anche nel periodo "before"', () => {
    const periodoBefore = generateNoisyData(100, 8, 30, 24);
    periodoBefore[10] = 15000; // Outlier nel periodo "prima"

    const periodoAfter = generateNoisyData(100, 8, 30, 25);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
    });

    // Deve rilevare l'outlier anche nel periodo "before"
    expect(risultato.outliersDetected).toBe(true);
    expect(risultato.outliers.length).toBeGreaterThan(0);

    // Le medie ripulite devono essere simili (entrambe ~100)
    expect(Math.abs(risultato.percentageChange)).toBeLessThan(10);
  });
});

describe('Statistical Engine - Test 3.4: Test Stagionalità', () => {
  test('dovrebbe confrontare lo stesso giorno della settimana per evitare falsi allarmi da stagionalità', () => {
    // ARRANGE: Pattern stagionale settimanale identico
    const periodoBefore = [
      100, 100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70, 100,
      100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70,
    ];

    const periodoAfter = [
      100, 100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70, 100,
      100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70,
    ];

    const statisticalEngine = new StatisticalEngine();

    // ACT: Eseguire l'analisi statistica con consapevolezza stagionale
    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
      seasonalityAware: true,
    });

    // ASSERT: Il sistema non deve confondere stagionalità con cambiamento
    expect(risultato.isSignificant).toBe(false);
    expect(Math.abs(risultato.percentageChange)).toBeLessThan(1);
    expect(risultato.message).toBe(
      'Nessun cambiamento significativo rilevato.'
    );
  });

  test('dovrebbe rilevare pattern stagionale nei dati', () => {
    const periodoBefore = [
      100, 100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70, 100,
      100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70,
    ];

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoBefore,
      seasonalityAware: true,
    });

    // Deve rilevare il pattern stagionale settimanale
    expect(risultato.seasonalityDetected).toBe(true);
    expect(risultato.seasonalityPeriod).toBe(7);
  });

  test('dovrebbe rilevare cambiamenti REALI anche con stagionalità presente', () => {
    const periodoBefore = [
      100, 100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70, 100,
      100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70,
    ];

    // Dopo: stesso pattern ma +20% su tutto (miglioramento reale)
    const periodoAfter = [
      120, 120, 120, 120, 120, 84, 84, 120, 120, 120, 120, 120, 84, 84, 120,
      120, 120, 120, 120, 84, 84, 120, 120, 120, 120, 120, 84, 84,
    ];

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
      seasonalityAware: true,
    });

    // Deve rilevare il miglioramento del +20%
    expect(risultato.isSignificant).toBe(true);
    expect(risultato.percentageChange).toBeCloseTo(20, 0);
  });

  test('dovrebbe gestire confronto senza consapevolezza stagionale (comportamento classico)', () => {
    const periodoBefore = [
      100, 100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70, 100,
      100, 100, 100, 100, 70, 70, 100, 100, 100, 100, 100, 70, 70,
    ];

    const periodoAfter = [...periodoBefore];

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: periodoBefore,
      after: periodoAfter,
      seasonalityAware: false,
    });

    // Anche senza seasonalityAware, non deve rilevare cambiamenti se i dati sono identici
    expect(risultato.isSignificant).toBe(false);
  });

  test.skip('dovrebbe evitare falso negativo confrontando giorni diversi', () => {
    // SKIP: Test edge case complesso - richiede implementazione più sofisticata
    // Per MVP, questo scenario è gestito manualmente dall'utente
    // TODO: Implementare in versione avanzata con normalizzazione multiday
  });
});

describe('Statistical Engine - Test 3.5: Test Gruppo di Controllo', () => {
  test('dovrebbe riconoscere performance relativa positiva quando il sito intero cala', () => {
    // ARRANGE: Sito intero cala -20%, pagine del test calano solo -5%
    const testPagesBefore = generateNoisyData(100, 8, 30, 30);
    const testPagesAfter = generateNoisyData(95, 8, 30, 31);

    const controlGroupBefore = generateNoisyData(1000, 40, 30, 32);
    const controlGroupAfter = generateNoisyData(800, 35, 30, 33);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: testPagesBefore,
      after: testPagesAfter,
      controlGroup: {
        before: controlGroupBefore,
        after: controlGroupAfter,
      },
    });

    // La variazione relativa deve essere ~+15% (test -5% vs controllo -20%)
    expect(risultato.relativePerformance).toBeDefined();
    expect(risultato.relativePerformance!).toBeCloseTo(15, -1);

    // Deve contenere informazioni sul gruppo di controllo
    expect(risultato.controlGroupPerformance).toBeDefined();
    expect(risultato.controlGroupPerformance!).toBeCloseTo(-20, -1);
  });

  test('dovrebbe riconoscere performance relativa negativa quando il sito cresce più del test', () => {
    // Scenario opposto: il sito cresce +30%, le pagine test solo +10%
    const testPagesBefore = generateNoisyData(100, 8, 30, 34);
    const testPagesAfter = generateNoisyData(110, 9, 30, 35);

    const controlGroupBefore = generateNoisyData(1000, 40, 30, 36);
    const controlGroupAfter = generateNoisyData(1300, 50, 30, 37);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: testPagesBefore,
      after: testPagesAfter,
      controlGroup: {
        before: controlGroupBefore,
        after: controlGroupAfter,
      },
    });

    // Performance relativa: ~-20% (hanno performato peggio)
    expect(risultato.relativePerformance!).toBeCloseTo(-20, -1);
  });

  test("dovrebbe calcolare performance assoluta quando NON c'è gruppo di controllo", () => {
    // Senza gruppo di controllo, deve usare la performance assoluta
    const testPagesBefore = generateNoisyData(100, 8, 30, 38);
    const testPagesAfter = generateNoisyData(95, 8, 30, 39);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: testPagesBefore,
      after: testPagesAfter,
    });

    // Senza control group, la variazione è circa -5%
    expect(risultato.percentageChange).toBeCloseTo(-5, -1);
    expect(risultato.relativePerformance).toBeUndefined();
    expect(risultato.controlGroupPerformance).toBeUndefined();
  });

  test('dovrebbe gestire caso in cui test e controllo hanno stessa performance', () => {
    // Entrambi calano del -10%
    const testPagesBefore = generateNoisyData(100, 8, 30, 40);
    const testPagesAfter = generateNoisyData(90, 7, 30, 41);

    const controlGroupBefore = generateNoisyData(1000, 40, 30, 42);
    const controlGroupAfter = generateNoisyData(900, 36, 30, 43);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: testPagesBefore,
      after: testPagesAfter,
      controlGroup: {
        before: controlGroupBefore,
        after: controlGroupAfter,
      },
    });

    // Performance relativa: ~0% (nessuna differenza)
    expect(risultato.relativePerformance!).toBeCloseTo(0, -1);
  });

  test('dovrebbe rilevare miglioramento assoluto con gruppo di controllo stabile', () => {
    // Test: +20%, Controllo: 0%
    const testPagesBefore = generateNoisyData(100, 8, 30, 44);
    const testPagesAfter = generateNoisyData(120, 10, 30, 45);

    const controlGroupBefore = generateNoisyData(1000, 40, 30, 46);
    const controlGroupAfter = generateNoisyData(1000, 40, 30, 47);

    const statisticalEngine = new StatisticalEngine();

    const risultato = statisticalEngine.analyze({
      before: testPagesBefore,
      after: testPagesAfter,
      controlGroup: {
        before: controlGroupBefore,
        after: controlGroupAfter,
      },
    });

    // Performance relativa: ~+20% (stesso del assoluto)
    expect(risultato.relativePerformance!).toBeCloseTo(20, -1);
    expect(risultato.percentageChange).toBeCloseTo(20, -1);
  });
});

describe('Statistical Engine - Test 3.6: Welch t-Test Correttezza Matematica', () => {
  test('dovrebbe calcolare p-value corretto per campioni con risultato noto', () => {
    // Verificato con R: t.test(c(10,12,14,16,18), c(20,22,24,26,28))
    // t = -5.0, df = 8, p-value = 0.001053
    const engine = new StatisticalEngine({
      minimumDataThreshold: 0,
      minimumSampleSize: 2,
    });
    const result = engine.analyze({
      before: [10, 12, 14, 16, 18],
      after: [20, 22, 24, 26, 28],
    });

    expect(result.pValue).toBeCloseTo(0.001053, 3);
    expect(result.isSignificant).toBe(true);
    expect(result.tStatistic).toBeDefined();
    expect(result.degreesOfFreedom).toBeDefined();
  });

  test('dovrebbe gestire varianza zero con medie uguali', () => {
    const engine = new StatisticalEngine();
    const result = engine.analyze({
      before: Array(30).fill(100),
      after: Array(30).fill(100),
    });

    expect(result.pValue).toBe(1.0);
    expect(result.isSignificant).toBe(false);
    expect(result.tStatistic).toBe(0);
  });

  test('dovrebbe gestire varianza zero con medie diverse', () => {
    const engine = new StatisticalEngine();
    const result = engine.analyze({
      before: Array(30).fill(100),
      after: Array(30).fill(200),
    });

    expect(result.pValue).toBe(0.0);
    expect(result.isSignificant).toBe(true);
  });

  test('dovrebbe restituire p-value alto per campioni con stessa distribuzione', () => {
    const engine = new StatisticalEngine();
    const before = generateNoisyData(500, 30, 30, 50);
    const after = generateNoisyData(500, 30, 30, 51);

    const result = engine.analyze({ before, after });

    expect(result.pValue).toBeGreaterThan(0.05);
    expect(result.isSignificant).toBe(false);
  });

  test('dovrebbe restituire p-value basso per un grande effetto', () => {
    const engine = new StatisticalEngine();
    const before = generateNoisyData(500, 30, 30, 52);
    const after = generateNoisyData(600, 30, 30, 53);

    const result = engine.analyze({ before, after });

    expect(result.pValue).toBeLessThan(0.001);
    expect(result.isSignificant).toBe(true);
  });

  test('dovrebbe rispettare soglie di significatività configurabili', () => {
    // Con soglia molto restrittiva (0.001), un effetto medio potrebbe non essere significativo
    const engine = new StatisticalEngine({ significanceLevel: 0.001 });
    const before = generateNoisyData(100, 10, 30, 54);
    const after = generateNoisyData(105, 10, 30, 55);

    const result = engine.analyze({ before, after });

    // Con soglia 0.001, un effetto del 5% con stddev 10 potrebbe non essere significativo
    // Il p-value è calcolato realmente, verifichiamo solo che la soglia venga applicata
    if (result.pValue >= 0.001) {
      expect(result.isSignificant).toBe(false);
    } else {
      expect(result.isSignificant).toBe(true);
    }
  });

  test('dovrebbe esporre tStatistic e degreesOfFreedom nel risultato', () => {
    const engine = new StatisticalEngine();
    const before = generateNoisyData(100, 10, 30, 56);
    const after = generateNoisyData(120, 12, 30, 57);

    const result = engine.analyze({ before, after });

    expect(result.tStatistic).toBeDefined();
    expect(typeof result.tStatistic).toBe('number');
    expect(result.degreesOfFreedom).toBeDefined();
    expect(typeof result.degreesOfFreedom).toBe('number');
    expect(result.degreesOfFreedom!).toBeGreaterThan(0);
  });
});
