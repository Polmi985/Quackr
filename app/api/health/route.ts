import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { getHealthReport, exportLogs } from '@/lib/monitoringService';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'health'; // health, logs, full

    // Otestuj Firebase connection
    let firebaseOk = false;
    try {
      const testQuery = query(collection(db, 'articles'), limit(1));
      await getDocs(testQuery);
      firebaseOk = true;
    } catch (error) {
      firebaseOk = false;
    }

    const health = getHealthReport();
    const logs = format !== 'health' ? exportLogs() : null;

    if (format === 'logs') {
      return NextResponse.json({
        success: true,
        logs,
        firebaseStatus: firebaseOk ? 'connected' : 'disconnected'
      });
    }

    if (format === 'full') {
      return NextResponse.json({
        success: true,
        health,
        logs,
        firebaseStatus: firebaseOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
      });
    }

    // Default: health format
    return NextResponse.json({
      success: true,
      health,
      firebaseStatus: firebaseOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get health status'
      },
      { status: 500 }
    );
  }
}
