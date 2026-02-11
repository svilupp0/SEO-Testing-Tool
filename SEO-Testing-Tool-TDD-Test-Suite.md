SEO Testing Tool – Test Suite Completa
Test-Driven Development (TDD) Specification
Introduzione al TDD per SEO Testing
Il TDD (Test-Driven Development) è fondamentale per un tool SEO dove la precisione dei dati è critica. La metodologia è semplice:
•	Scrivi il test
•	Vedi che fallisce (il codice non esiste ancora)
•	Scrivi il codice minimo per farlo passare
•	Migliora il codice (Refactor)
Perché TDD per questo progetto? Se sbagli un calcolo statistico, il tool è inutile. I test garantiscono che ogni componente funzioni correttamente prima di essere integrato.
1. Autenticazione e Accesso (La Sicurezza)
Questi test garantiscono che solo gli utenti autorizzati possano accedere ai propri dati e che il sistema gestisca correttamente le sessioni.
1.1 Test Login Google OAuth2
Obiettivo: Verificare che l'utente riesca a collegarsi tramite OAuth2.
Scenario: L'utente clicca su "Login con Google".
Risultato atteso: L'utente viene reindirizzato a Google, autorizza l'app, e torna autenticato.
Comportamento su fallimento: Messaggio di errore chiaro: "Impossibile connettersi a Google. Riprova."
Priorità: CRITICA

1.2 Test Scadenza Token
Obiettivo: Verificare che il sistema usi il refresh token quando l'access token scade.
Scenario: L'access token di Google scade dopo 1 ora.
Risultato atteso: Il sistema usa automaticamente il refresh token, l'utente non viene disconnesso.
Comportamento su fallimento: Richiesta di nuovo login solo se il refresh token è revocato.
Priorità: CRITICA

1.3 Test Revoca Accesso
Obiettivo: Verificare che il sistema reagisca correttamente se l'utente revoca l'accesso da Google.
Scenario: L'utente scollega l'app dalle impostazioni Google.
Risultato atteso: Il sistema smette di tentare il fetch, mostra: "Accesso revocato. Riconnetti il tuo account Google."
Comportamento su fallimento: Non deve continuare a fare richieste fallite generando errori 401.
Priorità: ALTA

1.4 Test Multi-tenancy (Cruciale)
Obiettivo: Verificare che l'utente A non possa accedere ai dati dell'utente B.
Scenario: L'utente A modifica l'URL per puntare a un test dell'utente B.
Risultato atteso: Errore 403 Forbidden: "Non hai i permessi per visualizzare questa risorsa."
Comportamento su fallimento: Questo è un bug di sicurezza CRITICO. I dati SEO sono confidenziali.
Priorità: CRITICA

1.5 Test Permessi GSC
Obiettivo: Verificare la gestione dei permessi read-only e assenza di permessi in GSC.
Scenario 1: L'utente ha accesso read-only a una proprietà GSC.
Risultato atteso: Il tool riesce a leggere i dati senza problemi.
Scenario 2: L'utente non ha permessi sulla proprietà.
Risultato atteso: Errore chiaro: "Non hai accesso a questa proprietà su Google Search Console."
Priorità: ALTA

2. Ingestione Dati (Il "Tubo" con Google)
Questi test verificano che il sistema raccolga i dati da Google Search Console in modo affidabile, gestendo errori e edge cases.
2.1 Test Rate Limit
Obiettivo: Verificare la gestione del rate limiting di Google (429 Too Many Requests).
Scenario: Google risponde con errore 429 durante il fetch.
Risultato atteso: Il sistema implementa exponential backoff: aspetta 1s, poi 2s, poi 4s, poi 8s prima di riprovare.
Comportamento su fallimento: Non deve crashare o ritentare immediatamente creando loop infiniti.
Priorità: CRITICA

2.2 Test Dati Mancanti
Obiettivo: Verificare la gestione del ritardo di 2–3 giorni tipico di GSC.
Scenario: GSC non ha ancora dati per gli ultimi 2 giorni.
Risultato atteso: Il sistema riconosce il gap temporale e NON lo calcola come traffico zero. Messaggio: "Dati non ancora disponibili per le ultime 48 ore."
Comportamento su fallimento: Interpretare il gap come perdita di traffico invalida completamente l'analisi.
Priorità: CRITICA

2.3 Test Discrepanza Fuso Orario
Obiettivo: Verificare l'allineamento corretto tra fuso orario di Google (PST) e utente.
Scenario: Utente in Italia (UTC+1/+2), Google invia dati in PST (UTC-8).
Risultato atteso: I grafici sono allineati al giorno corretto senza sfasamenti.
Comportamento su fallimento: Uno sfasamento di 1 giorno rende impossibile confrontare i dati.
Priorità: ALTA

2.4 Test Proprietà Giganti
Obiettivo: Verificare che il sistema gestisca siti con milioni di URL.
Scenario: Sito con 1.000.000+ URL in GSC.
Risultato atteso: Il sistema usa la paginazione dell'API GSC e processa i dati in batch senza timeout.
Comportamento su fallimento: Timeout o crash del server durante il fetch.
Priorità: ALTA

3. Motore Statistico (Il Cervello)
Questi sono i test più critici. Un errore qui rende il tool completamente inutile.
3.1 Test Ipotesi Nulla
Obiettivo: Verificare che il sistema riconosca correttamente quando non c'è stato alcun cambiamento.
Scenario: Dati identici per "Prima" e "Dopo" (100 click/giorno in entrambi i periodi).
Risultato atteso: p-value alto (>0.05), messaggio: "Nessun cambiamento significativo rilevato."
Comportamento su fallimento: Dichiarare un cambiamento quando non c'è stato è falso positivo.
Priorità: CRITICA

3.2 Test Significatività
Obiettivo: Verificare che il sistema non dichiari successo con dati insufficienti.
Scenario: Aumento del 5% su solo 10 click totali (da 10 a 10.5 click/giorno).
Risultato atteso: Messaggio: "Dati insufficienti per determinare significatività statistica. Continua il test."
Comportamento su fallimento: Dichiarare "Successo!" su rumore statistico danneggia la credibilità del tool.
Priorità: CRITICA

3.3 Test Outlier
Obiettivo: Verificare la gestione di picchi anomali (es. contenuto virale).
Scenario: Un post riceve 10.000 click in un giorno (normale: 100/giorno).
Risultato atteso: Il sistema applica tecniche di outlier detection (es. IQR, Z-score) e rimuove o segnala l'anomalia.
Comportamento su fallimento: Un outlier può falsare completamente la media e la deviazione standard.
Priorità: ALTA

3.4 Test Stagionalità
Obiettivo: Verificare che il sistema non confonda stagionalità con effetto della modifica SEO.
Scenario: Il traffico cala ogni sabato/domenica del -30% (pattern normale).
Risultato atteso: Il confronto usa lo stesso giorno della settimana (sabato vs sabato, non sabato vs lunedì).
Comportamento su fallimento: Incolpare la modifica SEO per variazioni stagionali normali.
Priorità: ALTA

3.5 Test Gruppo di Controllo
Obiettivo: Verificare il riconoscimento di performance relativa vs trend generale.
Scenario: Sito intero cala -20%, pagine del test calano solo -5%.
Risultato atteso: Il sistema riconosce che il test è in realtà positivo (+15% relativo). Messaggio: "Le pagine del test hanno performato meglio del resto del sito."
Comportamento su fallimento: Dichiarare il test negativo quando ha in realtà mitigato un calo generale.
Priorità: MEDIA (Feature avanzata, non MVP)

4. Gestione degli Esperimenti (Il Workflow)
Questi test verificano che il sistema gestisca correttamente la creazione, modifica e cancellazione dei test.
4.1 Test Sovrapposizione
Obiettivo: Verificare che non si possano lanciare test simultanei sulla stessa pagina.
Scenario: L'utente tenta di creare un secondo test su una pagina già in test attivo.
Risultato atteso: Errore: "Questa pagina è già inclusa nel test 'Nome Test'. Completa o cancella quel test prima di crearne uno nuovo."
Comportamento su fallimento: Test sovrapposti rendono impossibile attribuire i cambiamenti alla modifica corretta.
Priorità: ALTA

4.2 Test Modifica in Corso
Obiettivo: Verificare la gestione della modifica della data di inizio su test attivo.
Scenario: L'utente cambia la data di inizio da "1 gennaio" a "15 gennaio" dopo aver già raccolto dati.
Risultato atteso: Il sistema ricalcola baseline e post-modifica con le nuove date. Messaggio di conferma: "La modifica della data cancellerà i dati raccolti. Confermi?"
Comportamento su fallimento: Mantenere dati obsoleti con nuove date crea incoerenze.
Priorità: MEDIA

4.3 Test Cancellazione
Obiettivo: Verificare la politica di conservazione dati dopo cancellazione test.
Scenario: L'utente cancella un test completato.
Risultato atteso (opzione 1): I dati storici GSC rimangono nel database (non serve riscaricali), solo il test viene eliminato.
Risultato atteso (opzione 2): Eliminazione completa per privacy (GDPR compliance).
Decisione necessaria: Definire la politica in base ai requisiti legali e UX.
Priorità: MEDIA

5. Database e Performance (La Tenuta)
Questi test verificano che il sistema regga sotto carico e che i dati rimangano consistenti.
5.1 Test Concorrenza
Obiettivo: Verificare la gestione di richieste simultanee.
Scenario: 100 utenti lanciano un report nello stesso secondo.
Risultato atteso: Nessun deadlock database, tutte le richieste vengono elaborate (possibilmente in coda).
Comportamento su fallimento: Database lock, timeout, o crash del server.
Priorità: ALTA

5.2 Test Integrità Serie Temporale
Obiettivo: Verificare il recupero di dati mancanti dopo un fetch fallito.
Scenario: Il fetch di oggi fallisce per errore di rete.
Risultato atteso: Domani il sistema riprova a recuperare sia i dati di oggi che quelli di ieri, riempiendo i gap.
Comportamento su fallimento: Gap permanenti nella serie temporale rendono i confronti inaffidabili.
Priorità: ALTA

5.3 Test Storage
Obiettivo: Verificare le performance con volumi di dati realistici.
Scenario: 5 anni di dati giornalieri per 5000 pagine (circa 9 milioni di righe).
Risultato atteso: Le query di aggregazione (calcolo media, varianza) completano in <2 secondi con indici appropriati.
Comportamento su fallimento: Query lente (>10s) rendono il tool inutilizzabile.
Priorità: MEDIA (Ottimizzazione post-MVP)

6. Notifiche e Automazione (Il Valore)
Questi test verificano che le notifiche siano tempestive, accurate e non fastidiose.
6.1 Test Alert Vittoria
Obiettivo: Verificare che le notifiche vengano inviate solo quando statisticamente significative.
Scenario: Un test raggiunge p-value <0.05 con miglioramento del +20%.
Risultato atteso: Email: "Il tuo test 'Titolo Ottimizzato' mostra un miglioramento significativo! +20% click con 95% confidenza."
Comportamento su fallimento: Inviare notifiche per ogni minima variazione crea alert fatigue e riduce la fiducia.
Priorità: ALTA

6.2 Test Report Settimanale
Obiettivo: Verificare il formato del digest per utenti con test multipli.
Scenario: L'utente ha 10 test attivi.
Risultato atteso: Un'unica email settimanale con sezione per ogni test: stato, progressi, azioni consigliate.
Comportamento su fallimento: 10 email separate creano spam e l'utente disattiva le notifiche.
Priorità: MEDIA (Feature post-MVP)

7. Casi Estremi (I "Cattivi")
Questi sono gli edge cases che fanno crashare i tool mal progettati.
7.1 Test URL Redirect
Obiettivo: Verificare la gestione di pagine che vengono reindirizzate durante il test.
Scenario: La pagina /vecchio-url riceve redirect 301 a /nuovo-url durante il test.
Risultato atteso: Il sistema rileva il redirect e chiede: "URL reindirizzato. Vuoi continuare il test sul nuovo URL?"
Comportamento su fallimento: Continuare a tracciare l'URL vecchio (che ora ha traffico zero) invalida il test.
Priorità: ALTA

7.2 Test Cambio Dominio
Obiettivo: Verificare la gestione del cambio da HTTP a HTTPS (proprietà diverse in GSC).
Scenario: Il sito passa da http://example.com a https://example.com.
Risultato atteso: Il sistema riconosce che sono lo stesso sito e chiede: "Unire i dati delle due proprietà?"
Comportamento su fallimento: Trattarli come siti separati crea duplicati e confusione.
Priorità: MEDIA (Edge case raro)

7.3 Test "Sito Morto"
Obiettivo: Verificare la gestione di traffico zero prolungato (sito offline).
Scenario: Il traffico va a zero assoluto per 7 giorni consecutivi.
Risultato atteso: Alert critico: "Nessun traffico rilevato da 7 giorni. Il sito potrebbe essere offline. I test sono sospesi."
Comportamento su fallimento: Dichiarare tutti i test "peggiorati" quando in realtà il sito è down.
Priorità: MEDIA

8. UI/UX (L'Esperienza)
Questi test verificano che l'interfaccia sia usabile, veloce e accessibile.
8.1 Test Caricamento Infinito
Obiettivo: Verificare che l'utente riceva feedback durante operazioni lunghe.
Scenario: Il fetch dei dati da GSC impiega 30 secondi.
Risultato atteso: Barra di progresso con percentuale o spinner con messaggio: "Recupero dati da Google Search Console... 45%"
Comportamento su fallimento: Pagina bianca senza feedback fa pensare che il sistema sia crashato.
Priorità: ALTA

8.2 Test Mobile
Obiettivo: Verificare l'usabilità su smartphone.
Scenario: Utente visualizza un grafico statistico complesso su iPhone.
Risultato atteso: Grafico responsive, testo leggibile, interazioni touch funzionanti (pinch-to-zoom).
Comportamento su fallimento: Testo microscopico, grafici tagliati, impossibile navigare.
Priorità: ALTA (Molti SEO lavorano in mobilità)

8.3 Test Esportazione
Obiettivo: Verificare la corrispondenza tra dati a video e dati esportati.
Scenario: L'utente esporta un report in PDF/CSV per il cliente.
Risultato atteso: I numeri nel file esportato sono identici a quelli visualizzati nell'interfaccia.
Comportamento su fallimento: Discrepanze tra UI e export distruggono completamente la fiducia dell'utente.
Priorità: CRITICA

Matrice Priorità Test
Questa tabella riassume i test per priorità di implementazione.
Priorità	Test	Categoria
CRITICA	Login Google OAuth2	Autenticazione
CRITICA	Scadenza Token	Autenticazione
CRITICA	Multi-tenancy	Autenticazione
CRITICA	Rate Limit	Ingestione Dati
CRITICA	Dati Mancanti	Ingestione Dati
CRITICA	Ipotesi Nulla	Statistica
CRITICA	Significatività	Statistica
CRITICA	Esportazione	UI/UX
ALTA	Revoca Accesso	Autenticazione
ALTA	Permessi GSC	Autenticazione
ALTA	Discrepanza Fuso Orario	Ingestione Dati
ALTA	Proprietà Giganti	Ingestione Dati
ALTA	Outlier	Statistica
ALTA	Stagionalità	Statistica
ALTA	Sovrapposizione	Workflow
ALTA	Concorrenza	Performance
ALTA	Integrità Serie Temporale	Performance
ALTA	Alert Vittoria	Notifiche
ALTA	URL Redirect	Edge Cases
ALTA	Caricamento Infinito	UI/UX
ALTA	Mobile	UI/UX
MEDIA	Gruppo di Controllo	Statistica
MEDIA	Modifica in Corso	Workflow
MEDIA	Cancellazione	Workflow
MEDIA	Storage	Performance
MEDIA	Report Settimanale	Notifiche
MEDIA	Cambio Dominio	Edge Cases
MEDIA	Sito Morto	Edge Cases

Conclusione
Il TDD non è opzionale per un SEO Testing Tool. Ogni test in questo documento protegge il sistema da un fallimento specifico che potrebbe rendere il tool inutile o, peggio, dannoso (dando raccomandazioni sbagliate).
Approccio consigliato:
•	Inizia dai test CRITICI (rossi)
•	Aggiungi test ALTI (arancioni) durante lo sviluppo MVP
•	Rimanda test MEDI (gialli) post-lancio
Ogni test superato è una garanzia in più per gli utenti che il tool funziona davvero.
—
Versione 1.0 – TDD Test Suite Specification
