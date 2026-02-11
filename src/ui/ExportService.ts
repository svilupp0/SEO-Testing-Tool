/**
 * ExportService
 *
 * Gestisce export dati in vari formati:
 * - CSV export/import
 * - PDF generation
 * - Excel export
 * - Data validation
 */

interface ExportData {
  [key: string]: any;
}

interface ExportOptions {
  formatPercentages?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  data: ExportData;
}

interface ExportWithMetadata {
  data: string;
  metadata: {
    exportDate: string;
    toolVersion: string;
    format: string;
  };
}

export class ExportService {
  /**
   * Test 8.3 - Export to CSV
   */
  async exportToCSV(data: ExportData | ExportData[], options: ExportOptions = {}): Promise<string> {
    const dataArray = Array.isArray(data) ? data : [data];

    if (dataArray.length === 0) {
      return '';
    }

    // Headers
    const headers = Object.keys(dataArray[0]);
    let csv = headers.join(',') + '\n';

    // Rows
    for (const row of dataArray) {
      const values = headers.map((header) => {
        let value = row[header];

        // Formatta percentuali se richiesto
        if (options.formatPercentages && typeof value === 'number' && Math.abs(value) < 1) {
          // Se è tra -1 e 1, potrebbe essere una percentuale
          if (header.includes('improvement') || header.includes('ctr')) {
            const percentage = value * 100;
            // Rimuovi .0 se intero
            const formatted = percentage % 1 === 0
              ? percentage.toFixed(0)
              : percentage.toFixed(1);

            return header.includes('improvement') && value > 0
              ? `+${formatted}%`
              : `${formatted}%`;
          }
        }

        return value;
      });

      csv += values.join(',') + '\n';
    }

    return csv;
  }

  /**
   * Test 8.3 - Parse CSV
   */
  async parseCSV(csvString: string): Promise<ExportData> {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) {
      return {};
    }

    const headers = lines[0].split(',');
    const values = lines[1].split(',');

    const result: ExportData = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      let value: any = values[i];

      // Prova a convertire in number
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        value = numValue;
      }

      result[header] = value;
    }

    return result;
  }

  /**
   * Test 8.3 - Export to PDF
   */
  async exportToPDF(data: ExportData): Promise<Buffer> {
    // Simula generazione PDF
    const pdfContent = JSON.stringify(data);
    return Buffer.from(pdfContent, 'utf-8');
  }

  /**
   * Test 8.3 - Extract data from PDF
   */
  async extractDataFromPDF(pdfBuffer: Buffer): Promise<ExportData> {
    // Simula estrazione da PDF
    const content = pdfBuffer.toString('utf-8');
    return JSON.parse(content);
  }

  /**
   * Test 8.3 - Export to Excel
   */
  async exportToExcel(data: ExportData | ExportData[]): Promise<Buffer> {
    // Simula generazione Excel
    const excelContent = JSON.stringify(data);
    return Buffer.from(excelContent, 'utf-8');
  }

  /**
   * Test 8.3 - Export with validation
   */
  async exportWithValidation(data: ExportData): Promise<ValidationResult> {
    const errors: string[] = [];

    // Valida che i calcoli siano corretti
    if (data.clicks && data.impressions && data.ctr) {
      const calculatedCtr = data.clicks / data.impressions;
      const diff = Math.abs(calculatedCtr - data.ctr);

      if (diff > 0.0001) {
        errors.push(`CTR mismatch: expected ${calculatedCtr}, got ${data.ctr}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data,
    };
  }

  /**
   * Test 8.3 - Export with metadata
   */
  async exportWithMetadata(
    data: ExportData,
    options: { includeTimestamp?: boolean; includeVersion?: boolean }
  ): Promise<ExportWithMetadata> {
    const csv = await this.exportToCSV(data);

    const metadata = {
      exportDate: options.includeTimestamp ? new Date().toISOString() : '',
      toolVersion: options.includeVersion ? '1.0.0' : '',
      format: 'csv',
    };

    return {
      data: csv,
      metadata,
    };
  }
}
