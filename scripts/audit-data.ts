/**
 * Firestore Data Audit Script
 * 
 * Analyzes existing data to understand current usage patterns before migration.
 * 
 * Usage: npx tsx scripts/audit-data.ts
 * 
 * Outputs audit report to console and scripts/audits/<timestamp>.json
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface AuditReport {
  timestamp: string;
  projectId: string | undefined;
  routines: {
    total: number;
    byProtocolType: Record<string, number>;
    byOwnerType: Record<string, number>;
    tagsUsed: Record<string, number>;
    disciplinesUsed: Record<string, number>;
    trackingConfigStats: Record<string, number>;
  };
  logs: {
    total: number;
    byDiscipline: Record<string, number>;
    byRoutine: Record<string, number>;
    withTotalTime: number;
    withTotalDistance: number;
    withRepsCompleted: number;
    withLapsData: number;
    withCompetition: number;
    withRecords: number;
    fieldsUsed: Record<string, number>;
  };
  users: {
    total: number;
    withPersonalBests: number;
  };
  suggestions: string[];
}

/**
 * Audit routines collection
 */
async function auditRoutines(): Promise<AuditReport['routines']> {
  console.log('\n📋 Auditing routines...');
  
  const routinesRef = collection(db, 'routines');
  const snapshot = await getDocs(routinesRef);
  
  const stats = {
    total: snapshot.size,
    byProtocolType: {} as Record<string, number>,
    byOwnerType: {} as Record<string, number>,
    tagsUsed: {} as Record<string, number>,
    disciplinesUsed: {} as Record<string, number>,
    trackingConfigStats: {} as Record<string, number>
  };
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Protocol type
    const protocolType = data.protocolType || 'none';
    stats.byProtocolType[protocolType] = (stats.byProtocolType[protocolType] || 0) + 1;
    
    // Owner type (system vs user)
    const ownerType = data.isSystem ? 'system' : 'user';
    stats.byOwnerType[ownerType] = (stats.byOwnerType[ownerType] || 0) + 1;
    
    // Tags
    if (data.tags && Array.isArray(data.tags)) {
      for (const tag of data.tags) {
        stats.tagsUsed[tag] = (stats.tagsUsed[tag] || 0) + 1;
      }
    }
    
    // Disciplines
    if (data.disciplines && Array.isArray(data.disciplines)) {
      for (const discipline of data.disciplines) {
        stats.disciplinesUsed[discipline] = (stats.disciplinesUsed[discipline] || 0) + 1;
      }
    }
    
    // Tracking config - count which options are enabled
    if (data.trackingConfig) {
      for (const [key, value] of Object.entries(data.trackingConfig)) {
        if (value === true) {
          stats.trackingConfigStats[key] = (stats.trackingConfigStats[key] || 0) + 1;
        }
      }
    }
  }
  
  console.log(`   ✅ ${stats.total} routines analyzed`);
  console.log(`   Protocol types: ${JSON.stringify(stats.byProtocolType)}`);
  
  return stats;
}

/**
 * Audit logs across all routines
 */
async function auditLogs(): Promise<AuditReport['logs']> {
  console.log('\n📊 Auditing logs...');
  
  const routinesRef = collection(db, 'routines');
  const routinesSnapshot = await getDocs(routinesRef);
  
  const stats = {
    total: 0,
    byDiscipline: {} as Record<string, number>,
    byRoutine: {} as Record<string, number>,
    withTotalTime: 0,
    withTotalDistance: 0,
    withRepsCompleted: 0,
    withLapsData: 0,
    withCompetition: 0,
    withRecords: 0,
    fieldsUsed: {} as Record<string, number>
  };
  
  for (const routineDoc of routinesSnapshot.docs) {
    const routineId = routineDoc.id;
    const logsRef = collection(db, 'routines', routineId, 'logs');
    const logsSnapshot = await getDocs(logsRef);
    
    stats.byRoutine[routineId] = logsSnapshot.size;
    stats.total += logsSnapshot.size;
    
    for (const logDoc of logsSnapshot.docs) {
      const data = logDoc.data();
      
      // Discipline
      if (data.discipline) {
        stats.byDiscipline[data.discipline] = (stats.byDiscipline[data.discipline] || 0) + 1;
      }
      
      // Key fields
      if (data.totalTime !== undefined) stats.withTotalTime++;
      if (data.totalDistance !== undefined) stats.withTotalDistance++;
      if (data.repsCompleted !== undefined || data.summary?.repsCompleted !== undefined) stats.withRepsCompleted++;
      if (data.laps && Array.isArray(data.laps) && data.laps.length > 0) stats.withLapsData++;
      if (data.isCompetition === true) stats.withCompetition++;
      if (data.recordTag) stats.withRecords++;
      
      // Track all fields used
      for (const key of Object.keys(data)) {
        stats.fieldsUsed[key] = (stats.fieldsUsed[key] || 0) + 1;
      }
    }
  }
  
  console.log(`   ✅ ${stats.total} logs analyzed across ${routinesSnapshot.size} routines`);
  console.log(`   By discipline: ${JSON.stringify(stats.byDiscipline)}`);
  
  return stats;
}

/**
 * Audit users collection
 */
async function auditUsers(): Promise<AuditReport['users']> {
  console.log('\n👤 Auditing users...');
  
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  
  let withPersonalBests = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.personalBests && Object.keys(data.personalBests).length > 0) {
      withPersonalBests++;
    }
  }
  
  console.log(`   ✅ ${snapshot.size} users, ${withPersonalBests} with personal bests`);
  
  return {
    total: snapshot.size,
    withPersonalBests
  };
}

/**
 * Generate migration suggestions based on audit
 */
function generateSuggestions(report: Omit<AuditReport, 'suggestions'>): string[] {
  const suggestions: string[] = [];
  
  // Check protocol types
  const { byProtocolType } = report.routines;
  if (byProtocolType['none'] > 0) {
    suggestions.push(`${byProtocolType['none']} routines have protocolType='none' - will be inferred as max-attempt or free-training`);
  }
  if (byProtocolType['uniform'] > 0) {
    suggestions.push(`${byProtocolType['uniform']} routines have protocolType='uniform' - will become structured-intervals`);
  }
  if (byProtocolType['table'] > 0) {
    suggestions.push(`${byProtocolType['table']} routines have protocolType='table' - will become structured-intervals`);
  }
  
  // Check tracking config usage
  const topTrackingOptions = Object.entries(report.routines.trackingConfigStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  suggestions.push(`Most used tracking options: ${topTrackingOptions.map(([k, v]) => `${k}(${v})`).join(', ')}`);
  
  // Check logs with laps data
  if (report.logs.withLapsData > 0) {
    suggestions.push(`${report.logs.withLapsData} logs have per-lap data - these will benefit from speed calculations`);
  }
  
  // Check interval logs
  if (report.logs.withRepsCompleted > 0) {
    suggestions.push(`${report.logs.withRepsCompleted} logs have reps data - ideal for interval activity types`);
  }
  
  return suggestions;
}

/**
 * Save audit report
 */
function saveReport(report: AuditReport): void {
  const auditDir = path.join(__dirname, 'audits');
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(auditDir, `audit-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  
  console.log(`\n📁 Report saved to: ${filePath}`);
}

/**
 * Main audit function
 */
async function main(): Promise<void> {
  console.log('🔍 Firestore Data Audit');
  console.log('=======================');
  
  try {
    const report: AuditReport = {
      timestamp: new Date().toISOString(),
      projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
      routines: await auditRoutines(),
      logs: await auditLogs(),
      users: await auditUsers(),
      suggestions: []
    };
    
    // Generate suggestions
    report.suggestions = generateSuggestions(report);
    
    // Print summary
    console.log('\n📊 AUDIT SUMMARY');
    console.log('================');
    console.log(`Routines: ${report.routines.total}`);
    console.log(`Logs: ${report.logs.total}`);
    console.log(`Users: ${report.users.total}`);
    
    console.log('\n💡 MIGRATION SUGGESTIONS');
    console.log('========================');
    for (const suggestion of report.suggestions) {
      console.log(`  • ${suggestion}`);
    }
    
    // Save report
    saveReport(report);
    
    console.log('\n✅ Audit complete!');
    
  } catch (error) {
    console.error('\n❌ Audit failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
