/**
 * AuthorizationService - Gestione autorizzazioni multi-tenancy
 */

interface SecurityLog {
  userId: string;
  resourceId: string;
  action: string;
  result: 'allowed' | 'denied';
  timestamp: Date;
}

export class AuthorizationService {
  public supportsSharing: boolean = false;
  private static securityLogs: SecurityLog[] = [];
  private testRepo?: any;

  constructor(testRepo?: any) {
    this.testRepo = testRepo;
  }

  async checkTestAccess(userId: string, testId: string): Promise<boolean> {
    // Usa il repository passato o creane uno nuovo
    let repo = this.testRepo;
    if (!repo) {
      const { TestRepository } = await import('../tests/TestRepository');
      repo = new TestRepository();
    }
    
    try {
      const test = await repo.getTestOwner(testId);
      
      // Verifica se l'utente è il proprietario
      if (test.userId !== userId) {
        // Log tentativo non autorizzato
        AuthorizationService.securityLogs.push({
          userId,
          resourceId: testId,
          action: 'read_test',
          result: 'denied',
          timestamp: new Date(),
        });
        
        throw new Error('Non hai i permessi per visualizzare questa risorsa.');
      }
      
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Non hai i permessi')) {
        throw error;
      }
      throw new Error('Non hai i permessi per visualizzare questa risorsa.');
    }
  }

  async getSecurityLogs(filter: {
    userId?: string;
    eventType?: string;
  }): Promise<SecurityLog[]> {
    let logs = AuthorizationService.securityLogs;
    
    if (filter.userId) {
      logs = logs.filter(log => log.userId === filter.userId);
    }
    
    if (filter.eventType === 'unauthorized_access_attempt') {
      logs = logs.filter(log => log.result === 'denied');
    }
    
    return logs;
  }
}
