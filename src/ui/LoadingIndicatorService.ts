/**
 * LoadingIndicatorService
 *
 * Gestisce indicatori di caricamento e feedback utente:
 * - Progress bars
 * - Spinners
 * - Timeout handling
 * - Stato caricamento
 */

interface LoadingOptions {
  message?: string;
  showProgress?: boolean;
}

interface LoadingState {
  isVisible: boolean;
  message?: string;
  progress?: number;
  showProgress?: boolean;
  showSpinner?: boolean;
}

interface TimeoutResult {
  timedOut: boolean;
  error?: string;
  result?: any;
}

export class LoadingIndicatorService {
  private loadingStates: Map<string, LoadingState> = new Map();
  private progressCallbacks: Map<string, (progress: number) => void> = new Map();

  /**
   * Test 8.1 - Traccia progresso di un task
   */
  async trackProgress(
    taskId: string,
    task: (updateProgress: (progress: number) => void) => Promise<void>,
    onProgress: (progress: number) => void
  ): Promise<void> {
    // Salva callback per aggiornamenti
    this.progressCallbacks.set(taskId, onProgress);

    // Inizia da 0%
    onProgress(0);

    // Esegui task con funzione di update
    await task((progress: number) => {
      onProgress(progress);
    });
  }

  /**
   * Test 8.1 - Avvia loading con opzioni
   */
  async startLoading(loadingId: string, options: LoadingOptions = {}): Promise<LoadingState> {
    const state: LoadingState = {
      isVisible: true,
      message: options.message,
      showProgress: options.showProgress || false,
      showSpinner: !options.showProgress, // Spinner se no progress
      progress: 0,
    };

    this.loadingStates.set(loadingId, state);
    return state;
  }

  /**
   * Test 8.1 - Ferma loading
   */
  async stopLoading(loadingId: string): Promise<void> {
    const state = this.loadingStates.get(loadingId);
    if (state) {
      state.isVisible = false;
      this.loadingStates.set(loadingId, state);
    }
  }

  /**
   * Test 8.1 - Aggiorna percentuale progresso
   */
  async updateProgress(loadingId: string, progress: number): Promise<void> {
    const state = this.loadingStates.get(loadingId);
    if (state) {
      state.progress = progress;
      this.loadingStates.set(loadingId, state);

      // Notifica callback se presente
      const callback = this.progressCallbacks.get(loadingId);
      if (callback) {
        callback(progress);
      }
    }
  }

  /**
   * Test 8.1 - Ottieni stato loading (return copy to avoid mutation)
   */
  async getLoadingState(loadingId: string): Promise<LoadingState> {
    const state = this.loadingStates.get(loadingId);

    if (!state) {
      return {
        isVisible: false,
        progress: 0,
      };
    }

    // Return a copy to avoid reference mutation
    return { ...state };
  }

  /**
   * Test 8.1 - Esegui task con timeout
   */
  async executeWithTimeout(
    _taskId: string,
    task: () => Promise<any>,
    timeoutMs: number
  ): Promise<TimeoutResult> {
    return new Promise((resolve) => {
      let completed = false;

      // Timeout timer
      const timeoutTimer = setTimeout(() => {
        if (!completed) {
          completed = true;
          resolve({
            timedOut: true,
            error: `Task exceeded timeout of ${timeoutMs}ms`,
          });
        }
      }, timeoutMs);

      // Esegui task
      task()
        .then((result) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutTimer);
            resolve({
              timedOut: false,
              result,
            });
          }
        })
        .catch((error) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutTimer);
            resolve({
              timedOut: false,
              error: error.message,
            });
          }
        });
    });
  }
}
