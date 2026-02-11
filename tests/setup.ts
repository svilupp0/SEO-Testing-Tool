/**
 * Test Setup - Configurazione globale per Vitest
 * Carica le variabili d'ambiente prima di eseguire i test
 */

import { config } from 'dotenv';

// Carica variabili d'ambiente dal file .env
config();

// Opzionale: Setup globale per i test
// beforeAll(() => {
//   // Configurazione globale prima di tutti i test
// });

// afterAll(() => {
//   // Cleanup globale dopo tutti i test
// });
