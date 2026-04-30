SEO Testing Tool � Specifica Completa
Documento di progettazione tecnica (no code)
Visione
Questo documento descrive ogni singolo dettaglio di un SEO Testing Tool, pensato per essere progettato prima di scrivere codice. L'obiettivo � arrivare a un sistema chiaro, rigoroso e onesto dal punto di vista statistico.

1. Obiettivo del prodotto
   Rispondere in modo affidabile a una sola domanda:
   "Questa modifica SEO ha probabilmente migliorato o peggiorato le performance su Google?"
   Il tool non promette certezze, ma supporta decisioni informate.
2. Attori del sistema
   2.1 Utenti
   � SEO freelance
   � Agenzia SEO
   � Team marketing di un SaaS/ecommerce
   2.2 Sistemi esterni
   � Google Search Console API (unica fonte dati)
   � Google OAuth
3. Concetti fondamentali (linguaggio condiviso)
   3.1 Site
   Un sito web collegato tramite GSC.
   3.2 Page
   Una URL presente in GSC.
   3.3 Page Cluster
   Un gruppo di pagine simili (stesso template, categoria, intento). Serve per aumentare la potenza statistica.
   3.4 Test
   Un esperimento dichiarato dall'utente che confronta prima vs dopo una modifica.
   3.5 Baseline
   I dati storici precedenti alla modifica.
   3.6 Observation Window
   Periodo temporale analizzato (prima/dopo).
4. Flusso funzionale completo
   4.1 Onboarding
   � Registrazione utente
   � Login via Google OAuth
   � Autorizzazione GSC (read-only)
   � Selezione propriet� GSC
   Il sistema salva:

- Account Google
- site_url
- Tipo property (domain/url-prefix)
  4.2 Validazione iniziale del sito
  Il sistema calcola:
  � Impression totali ultimi 30/60 giorni
  � Click totali
  � Numero di pagine attive
  Regole:
  � Se impressions < soglia ? sito non testabile
  � Se click < soglia ? avviso forte
  Output UX:
  "Il sito non ha ancora abbastanza traffico per test statistici affidabili."
  4.3 Creazione di un Test
  Input richiesti all'utente:
  � Nome test
  � Tipo di modifica (title, meta, contenuto, schema, internal linking, etc.)
  � Descrizione libera (testuale)
  � Data prevista modifica
  � Selezione scope:
- Singole pagine
- Cluster di pagine
  Il tool non modifica il sito.
  4.4 Congelamento Baseline
  Alla creazione del test:
  � Il sistema salva uno snapshot dei dati storici
  � Periodo consigliato: 14�28 giorni precedenti
  Metriche salvate:
  � Impressions
  � Clicks
  � CTR
  � Average position
  4.5 Periodo di attesa (cooling period)
  Regole:
  � Primi 2�3 giorni post-modifica esclusi
  � Stato test = "Waiting for stable data"
  � Nessuna analisi mostrata
  4.6 Raccolta dati post-modifica
  � Finestre temporali simmetriche (es. 14 giorni prima / 14 dopo)
  � Esclusione giorni incompleti GSC
  4.7 Analisi statistica
  Principi:
  � Mai risultati assoluti
  � Solo probabilit�
  Output calcolati:
  � Delta medio
  � Intervallo di confidenza
  � Probabilit� di miglioramento
  Classificazione:
  ?? Probabile miglioramento
  ?? Inconclusivo
  ?? Probabile peggioramento
  4.8 Chiusura Test
  Il test viene marcato come:
  � Completed
  � Inconclusive
  I risultati restano consultabili e confrontabili.

5. Database � Schema concettuale
   5.1 users
   � id
   � email
   � name
   � created_at
   5.2 sites
   � id
   � user_id
   � gsc_property
   � verified_at
   5.3 pages
   � id
   � site_id
   � url
   � last_seen_at
   5.4 page_clusters
   � id
   � site_id
   � name
   5.5 page_cluster_members
   � cluster_id
   � page_id
   5.6 tests
   � id
   � site_id
   � name
   � description
   � test_type
   � status
   � created_at
   � started_at
   � ended_at
   5.7 test_pages
   � test_id
   � page_id
   5.8 metrics_snapshots
   � id
   � test_id
   � page_or_cluster_id
   � period (baseline/post)
   � impressions
   � clicks
   � ctr
   � avg_position
   � start_date
   � end_date
6. Stati del Test (state machine)
   � Draft
   � Baseline Collected
   � Waiting for Data
   � Analyzing
   � Completed
   � Inconclusive
7. Principi UX
   � Sempre spiegare perch�
   � Mai mostrare grafici senza contesto
   � Copy onesto > wow effect
8. Limiti dichiarati (by design)
   � Non funziona su siti piccoli
   � Non � realtime
   � Non garantisce risultati
   Questi limiti aumentano fiducia.
9. Estensioni future (non MVP)
   � Suggerimenti automatici di test
   � Benchmark anonimi cross-site
   � Report per clienti agency
10. Filosofia
    Questo non � un tool SEO. � uno strumento decisionale.
    �
    Versione 1.0 � Documento di specifica completa
