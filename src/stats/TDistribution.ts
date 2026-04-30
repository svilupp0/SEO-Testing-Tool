/**
 * Distribuzione t di Student - Implementazione self-contained
 *
 * Calcola p-value reali per il Welch's t-test senza dipendenze esterne.
 * Usa l'approssimazione di Lanczos per log-gamma e l'algoritmo di Lentz
 * per la regularized incomplete beta function.
 */

const LANCZOS_COEFFICIENTS = [
  76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
  0.1208650973866179e-2, -0.5395239384953e-5,
];

/**
 * Logaritmo naturale della funzione Gamma.
 * Usa l'approssimazione di Lanczos con 6 coefficienti (~15 cifre di precisione).
 */
export function lnGamma(x: number): number {
  if (x <= 0) throw new Error('lnGamma richiede x > 0');

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);

  let ser = 1.000000000190015;
  for (const coeff of LANCZOS_COEFFICIENTS) {
    ser += coeff / ++y;
  }

  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/**
 * Regularized Incomplete Beta Function I_x(a, b).
 * Usa l'algoritmo di Lentz per la continued fraction evaluation.
 */
export function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number
): number {
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Relazione di simmetria per convergenza ottimale
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz continued fraction per I_x(a, b)
  const maxIterations = 200;
  const epsilon = 1e-10;
  const tiny = 1e-30;

  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let result = d;

  for (let m = 1; m <= maxIterations; m++) {
    // Numeratore per termine dispari d_{2m-1}
    let numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    result *= d * c;

    // Numeratore per termine pari d_{2m}
    numerator = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;

    const delta = d * c;
    result *= delta;

    // Convergenza raggiunta
    if (Math.abs(delta - 1) < epsilon) {
      break;
    }
  }

  // Clamp per sicurezza numerica
  return Math.max(0, Math.min(1, front * result));
}

/**
 * CDF della distribuzione t di Student.
 * P(T <= t) per una variabile t con df gradi di libertà.
 */
export function studentTCDF(t: number, df: number): number {
  if (df <= 0) throw new Error('Gradi di libertà devono essere > 0');
  if (!isFinite(t)) return t > 0 ? 1 : 0;
  if (t === 0) return 0.5;

  const x = df / (df + t * t);
  const ibeta = regularizedIncompleteBeta(x, df / 2, 0.5);

  if (t > 0) {
    return 1 - 0.5 * ibeta;
  } else {
    return 0.5 * ibeta;
  }
}

/**
 * P-value two-tailed per il test t di Student.
 * Calcola P(|T| > |t|) = I_x(df/2, 1/2) dove x = df/(df + t²).
 */
export function twoTailedPValue(t: number, df: number): number {
  if (isNaN(t) || isNaN(df) || df <= 0) return 1;
  if (!isFinite(t)) return 0;

  const absT = Math.abs(t);
  const x = df / (df + absT * absT);

  return Math.max(0, Math.min(1, regularizedIncompleteBeta(x, df / 2, 0.5)));
}
