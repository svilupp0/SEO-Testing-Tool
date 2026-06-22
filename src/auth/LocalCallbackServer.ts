/**
 * LocalCallbackServer
 *
 * Avvia un server HTTP locale su 127.0.0.1 per catturare automaticamente
 * il redirect OAuth2 di Google senza richiedere copia-incolla del codice.
 *
 * Due fasi:
 * 1. startCallbackServer() risolve quando il server è in ascolto (porta disponibile)
 * 2. La promise interna risolve quando Google manda il redirect con ?code=...&state=...
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const HTML_SUCCESS = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><title>Login completato</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
<h1>&#10003; Login completato!</h1>
<p>Puoi chiudere questa finestra e tornare al terminale.</p>
</body>
</html>`;

const HTML_ERROR = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><title>Accesso negato</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
<h1>&#10007; Accesso negato.</h1>
<p>Torna al terminale e riprova.</p>
</body>
</html>`;

export async function startCallbackServer(
  port = 3000,
  callbackPath = '/auth/callback',
  timeoutMs = 120_000
): Promise<{ promise: Promise<{ code: string; state: string }> }> {
  return new Promise((resolveStart, rejectStart) => {
    let resolveCallback!: (v: { code: string; state: string }) => void;
    let rejectCallback!: (e: Error) => void;

    const callbackPromise = new Promise<{ code: string; state: string }>((res, rej) => {
      resolveCallback = res;
      rejectCallback = rej;
    });

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

      if (url.pathname !== callbackPath) {
        res.writeHead(404);
        res.end();
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_ERROR);
        server.close();
        rejectCallback(new Error(`OAuth error: ${error}`));
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code || !state) {
        res.writeHead(400);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML_SUCCESS);
      server.close();
      resolveCallback({ code, state });
    });

    const timeout = setTimeout(() => {
      server.close();
      rejectCallback(new Error('Timeout: nessun callback ricevuto entro 2 minuti.'));
    }, timeoutMs);

    server.on('close', () => clearTimeout(timeout));

    server.on('error', (err: Error) => {
      clearTimeout(timeout);
      rejectStart(err);
    });

    server.listen(port, '127.0.0.1', () => {
      resolveStart({ promise: callbackPromise });
    });
  });
}
