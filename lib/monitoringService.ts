/**
 * Monitoring service pro error logging, warning tracking a metriky
 * Centralizované řešení pro monitorování scrapingu a ukládání dat
 */

interface ErrorLog {
  timestamp: string;
  severity: 'error' | 'warning' | 'info';
  service: string; // 'ct24Scraper', 'seznamScraper', 'articleService', etc.
  message: string;
  details?: Record<string, any>;
  stack?: string;
}

interface MetricLog {
  timestamp: string;
  service: string;
  metricName: string;
  value: number;
  tags?: Record<string, string>;
}

// In-memory logs (v produkci by se měly posílat na server/Sentry/DataDog)
let errorLogs: ErrorLog[] = [];
let metricLogs: MetricLog[] = [];

const MAX_LOGS_IN_MEMORY = 1000; // Limit pro in-memory storage

/**
 * Loguje chybu s kontextem
 */
export function logError(
  service: string,
  message: string,
  details?: Record<string, any>,
  error?: Error
): void {
  const errorLog: ErrorLog = {
    timestamp: new Date().toISOString(),
    severity: 'error',
    service,
    message,
    details,
    stack: error?.stack
  };

  errorLogs.push(errorLog);
  
  // Udržuj limit
  if (errorLogs.length > MAX_LOGS_IN_MEMORY) {
    errorLogs = errorLogs.slice(-MAX_LOGS_IN_MEMORY);
  }

  // Console logging
  console.error(`[${service}] ERROR: ${message}`, {
    details,
    stack: error?.stack
  });
}

/**
 * Loguje varování
 */
export function logWarning(
  service: string,
  message: string,
  details?: Record<string, any>
): void {
  const errorLog: ErrorLog = {
    timestamp: new Date().toISOString(),
    severity: 'warning',
    service,
    message,
    details
  };

  errorLogs.push(errorLog);
  
  if (errorLogs.length > MAX_LOGS_IN_MEMORY) {
    errorLogs = errorLogs.slice(-MAX_LOGS_IN_MEMORY);
  }

  console.warn(`[${service}] WARNING: ${message}`, details);
}

/**
 * Loguje info zprávu
 */
export function logInfo(
  service: string,
  message: string,
  details?: Record<string, any>
): void {
  const errorLog: ErrorLog = {
    timestamp: new Date().toISOString(),
    severity: 'info',
    service,
    message,
    details
  };

  errorLogs.push(errorLog);
  
  if (errorLogs.length > MAX_LOGS_IN_MEMORY) {
    errorLogs = errorLogs.slice(-MAX_LOGS_IN_MEMORY);
  }

  console.log(`[${service}] INFO: ${message}`, details);
}

/**
 * Loguje metriku (počet artikulů, doba scrapingu, atd.)
 */
export function logMetric(
  service: string,
  metricName: string,
  value: number,
  tags?: Record<string, string>
): void {
  const metric: MetricLog = {
    timestamp: new Date().toISOString(),
    service,
    metricName,
    value,
    tags
  };

  metricLogs.push(metric);
  
  if (metricLogs.length > MAX_LOGS_IN_MEMORY) {
    metricLogs = metricLogs.slice(-MAX_LOGS_IN_MEMORY);
  }

  console.log(`[${service}] METRIC: ${metricName} = ${value}`, tags);
}

/**
 * Vrátí všechny chyby z posledních N hodin
 */
export function getRecentErrors(hoursBack: number = 24): ErrorLog[] {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hoursBack);

  return errorLogs.filter(log => new Date(log.timestamp) >= cutoffTime);
}

/**
 * Vrátí všechny chyby od konkrétní služby
 */
export function getErrorsByService(service: string): ErrorLog[] {
  return errorLogs.filter(log => log.service === service);
}

/**
 * Vrátí statistiku chyb
 */
export function getErrorStats(): {
  totalErrors: number;
  totalWarnings: number;
  errorsByService: Record<string, number>;
  warningsByService: Record<string, number>;
} {
  const stats = {
    totalErrors: errorLogs.filter(e => e.severity === 'error').length,
    totalWarnings: errorLogs.filter(e => e.severity === 'warning').length,
    errorsByService: {} as Record<string, number>,
    warningsByService: {} as Record<string, number>
  };

  errorLogs.forEach(log => {
    if (log.severity === 'error') {
      stats.errorsByService[log.service] = (stats.errorsByService[log.service] || 0) + 1;
    } else if (log.severity === 'warning') {
      stats.warningsByService[log.service] = (stats.warningsByService[log.service] || 0) + 1;
    }
  });

  return stats;
}

/**
 * Vrátí všechny metriky od konkrétní služby
 */
export function getMetricsByService(service: string): MetricLog[] {
  return metricLogs.filter(m => m.service === service);
}

/**
 * Vrátí průměrnou hodnotu metriky
 */
export function getAverageMetric(service: string, metricName: string): number {
  const metrics = metricLogs.filter(
    m => m.service === service && m.metricName === metricName
  );

  if (metrics.length === 0) return 0;

  const sum = metrics.reduce((acc, m) => acc + m.value, 0);
  return sum / metrics.length;
}

/**
 * Vymaž všechny logy (pro testing)
 */
export function clearAllLogs(): void {
  errorLogs = [];
  metricLogs = [];
  console.log('[monitoring] All logs cleared');
}

/**
 * Vrátí summary report o zdraví systému
 */
export function getHealthReport(): {
  timestamp: string;
  isHealthy: boolean;
  errorCount: number;
  warningCount: number;
  errorRate: number;
  report: string;
} {
  const stats = getErrorStats();
  const totalLogs = stats.totalErrors + stats.totalWarnings;
  const errorRate = totalLogs > 0 ? (stats.totalErrors / totalLogs) * 100 : 0;

  const isHealthy = stats.totalErrors < 10 && errorRate < 30;

  let report = `System Health Report:\n`;
  report += `- Total Errors: ${stats.totalErrors}\n`;
  report += `- Total Warnings: ${stats.totalWarnings}\n`;
  report += `- Error Rate: ${errorRate.toFixed(2)}%\n`;
  report += `- Status: ${isHealthy ? '✅ HEALTHY' : '⚠️ ISSUES DETECTED'}\n`;

  if (Object.keys(stats.errorsByService).length > 0) {
    report += `\nErrors by Service:\n`;
    Object.entries(stats.errorsByService).forEach(([service, count]) => {
      report += `  - ${service}: ${count}\n`;
    });
  }

  return {
    timestamp: new Date().toISOString(),
    isHealthy,
    errorCount: stats.totalErrors,
    warningCount: stats.totalWarnings,
    errorRate: parseFloat(errorRate.toFixed(2)),
    report
  };
}

/**
 * Exportuj logy jako JSON (pro debugování)
 */
export function exportLogs(): {
  errors: ErrorLog[];
  metrics: MetricLog[];
  stats: ReturnType<typeof getErrorStats>;
} {
  return {
    errors: errorLogs,
    metrics: metricLogs,
    stats: getErrorStats()
  };
}
