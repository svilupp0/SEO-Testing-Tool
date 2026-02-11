import { lnGamma, regularizedIncompleteBeta, studentTCDF, twoTailedPValue } from '../../src/stats/TDistribution';

describe('TDistribution - Primitive Matematiche', () => {
  describe('lnGamma', () => {
    test('dovrebbe calcolare correttamente Gamma(1) = 0! = 1', () => {
      expect(Math.exp(lnGamma(1))).toBeCloseTo(1, 10);
    });

    test('dovrebbe calcolare correttamente Gamma(5) = 4! = 24', () => {
      expect(Math.exp(lnGamma(5))).toBeCloseTo(24, 8);
    });

    test('dovrebbe calcolare correttamente Gamma(0.5) = sqrt(pi)', () => {
      expect(Math.exp(lnGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 8);
    });

    test('dovrebbe calcolare correttamente Gamma(10) = 9! = 362880', () => {
      expect(Math.exp(lnGamma(10))).toBeCloseTo(362880, 0);
    });

    test('dovrebbe lanciare errore per x <= 0', () => {
      expect(() => lnGamma(0)).toThrow();
      expect(() => lnGamma(-1)).toThrow();
    });
  });

  describe('regularizedIncompleteBeta', () => {
    test('dovrebbe restituire 0 per x=0', () => {
      expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    });

    test('dovrebbe restituire 1 per x=1', () => {
      expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
    });

    test('dovrebbe calcolare I_0.5(1, 1) = 0.5', () => {
      // Beta(1,1) è uniforme, quindi I_0.5 = 0.5
      expect(regularizedIncompleteBeta(0.5, 1, 1)).toBeCloseTo(0.5, 8);
    });

    test('dovrebbe calcolare I_0.5(2, 2) = 0.5 (simmetria)', () => {
      expect(regularizedIncompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 6);
    });

    test('dovrebbe rispettare la relazione di simmetria I_x(a,b) = 1 - I_{1-x}(b,a)', () => {
      const x = 0.3;
      const a = 2.5;
      const b = 3.5;
      const forward = regularizedIncompleteBeta(x, a, b);
      const symmetric = 1 - regularizedIncompleteBeta(1 - x, b, a);
      expect(forward).toBeCloseTo(symmetric, 8);
    });
  });

  describe('studentTCDF', () => {
    test('dovrebbe restituire 0.5 per t=0 (qualsiasi df)', () => {
      expect(studentTCDF(0, 10)).toBe(0.5);
      expect(studentTCDF(0, 30)).toBe(0.5);
    });

    test('dovrebbe restituire >0.5 per t positivo', () => {
      expect(studentTCDF(2.0, 10)).toBeGreaterThan(0.5);
    });

    test('dovrebbe restituire <0.5 per t negativo', () => {
      expect(studentTCDF(-2.0, 10)).toBeLessThan(0.5);
    });

    test('dovrebbe essere simmetrica: CDF(t) + CDF(-t) = 1', () => {
      const cdfPos = studentTCDF(1.5, 15);
      const cdfNeg = studentTCDF(-1.5, 15);
      expect(cdfPos + cdfNeg).toBeCloseTo(1.0, 8);
    });

    test('dovrebbe avvicinarsi a 1 per t molto grande', () => {
      expect(studentTCDF(100, 10)).toBeCloseTo(1.0, 6);
    });

    test('dovrebbe avvicinarsi a 0 per t molto negativo', () => {
      expect(studentTCDF(-100, 10)).toBeCloseTo(0.0, 6);
    });
  });

  describe('twoTailedPValue', () => {
    test('dovrebbe restituire p~0.0734 per t=2.0, df=10 (verificato con R)', () => {
      // R: 2 * pt(-2, 10) = 0.07338
      expect(twoTailedPValue(2.0, 10)).toBeCloseTo(0.0734, 3);
    });

    test('dovrebbe restituire p~0.05 per t=2.228, df=10 (valore critico)', () => {
      // R: 2 * pt(-2.228, 10) ≈ 0.05
      expect(twoTailedPValue(2.228, 10)).toBeCloseTo(0.05, 2);
    });

    test('dovrebbe restituire p~0.05 per t=2.045, df=29 (valore critico df=29)', () => {
      // R: 2 * pt(-2.045, 29) ≈ 0.05
      expect(twoTailedPValue(2.045, 29)).toBeCloseTo(0.05, 2);
    });

    test('dovrebbe restituire p=1.0 per t=0', () => {
      expect(twoTailedPValue(0, 10)).toBeCloseTo(1.0, 8);
    });

    test('dovrebbe restituire p~0 per t molto grande', () => {
      expect(twoTailedPValue(50, 10)).toBeCloseTo(0, 6);
    });

    test('dovrebbe essere simmetrico: p(-t) = p(t)', () => {
      expect(twoTailedPValue(-2.5, 20)).toBeCloseTo(twoTailedPValue(2.5, 20), 10);
    });

    test('dovrebbe gestire t=Infinity restituendo 0', () => {
      expect(twoTailedPValue(Infinity, 10)).toBe(0);
    });

    test('dovrebbe gestire NaN restituendo 1', () => {
      expect(twoTailedPValue(NaN, 10)).toBe(1);
    });

    test('dovrebbe gestire df <= 0 restituendo 1', () => {
      expect(twoTailedPValue(2.0, 0)).toBe(1);
      expect(twoTailedPValue(2.0, -5)).toBe(1);
    });
  });
});
