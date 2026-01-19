/**
 * Firestore Backup Script
 * 
 * Exports all Firestore collections to JSON files for backup before major changes.
 * 
 * Usage: npx tsx scripts/backup-firestore.ts
 * 
 * Creates backup files in: scripts/backups/<timestamp>/
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc,
  getDoc
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

// Create timestamp for backup folder
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(__dirname, 'backups', timestamp);

interface BackupStats {
  collection: string;
  documentCount: number;
  subCollectionCounts?: Record<string, number>;
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(): void {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  console.log(`📁 Backup directory: ${backupDir}`);
}

/**
 * Export a collection to JSON
 */
async function exportCollection(collectionName: string): Promise<BackupStats> {
  console.log(`\n📤 Exporting ${collectionName}...`);
  
  const collRef = collection(db, collectionName);
  const snapshot = await getDocs(collRef);
  
  const documents: Record<string, unknown> = {};
  
  for (const docSnap of snapshot.docs) {
    documents[docSnap.id] = {
      id: docSnap.id,
      ...docSnap.data()
    };
  }
  
  const filePath = path.join(backupDir, `${collectionName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(documents, null, 2));
  
  console.log(`   ✅ ${snapshot.size} documents exported to ${collectionName}.json`);
  
  return {
    collection: collectionName,
    documentCount: snapshot.size
  };
}

/**
 * Export routines with their logs subcollections
 */
async function exportRoutinesWithLogs(): Promise<BackupStats> {
  console.log(`\n📤 Exporting routines with logs...`);
  
  const routinesRef = collection(db, 'routines');
  const routinesSnapshot = await getDocs(routinesRef);
  
  const routinesWithLogs: Record<string, unknown> = {};
  const logCounts: Record<string, number> = {};
  let totalLogs = 0;
  
  for (const routineDoc of routinesSnapshot.docs) {
    const routineId = routineDoc.id;
    const routineData = routineDoc.data();
    
    // Get logs subcollection
    const logsRef = collection(db, 'routines', routineId, 'logs');
    const logsSnapshot = await getDocs(logsRef);
    
    const logs: Record<string, unknown> = {};
    for (const logDoc of logsSnapshot.docs) {
      logs[logDoc.id] = {
        id: logDoc.id,
        ...logDoc.data()
      };
    }
    
    routinesWithLogs[routineId] = {
      id: routineId,
      ...routineData,
      _logs: logs,
      _logsCount: logsSnapshot.size
    };
    
    logCounts[routineId] = logsSnapshot.size;
    totalLogs += logsSnapshot.size;
    
    if (logsSnapshot.size > 0) {
      console.log(`   📋 ${routineId}: ${logsSnapshot.size} logs`);
    }
  }
  
  const filePath = path.join(backupDir, 'routines-with-logs.json');
  fs.writeFileSync(filePath, JSON.stringify(routinesWithLogs, null, 2));
  
  console.log(`   ✅ ${routinesSnapshot.size} routines with ${totalLogs} total logs exported`);
  
  return {
    collection: 'routines-with-logs',
    documentCount: routinesSnapshot.size,
    subCollectionCounts: logCounts
  };
}

/**
 * Export users collection
 */
async function exportUsers(): Promise<BackupStats> {
  console.log(`\n📤 Exporting users...`);
  
  const usersRef = collection(db, 'users');
  const usersSnapshot = await getDocs(usersRef);
  
  const users: Record<string, unknown> = {};
  
  for (const userDoc of usersSnapshot.docs) {
    users[userDoc.id] = {
      id: userDoc.id,
      ...userDoc.data()
    };
  }
  
  const filePath = path.join(backupDir, 'users.json');
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
  
  console.log(`   ✅ ${usersSnapshot.size} users exported`);
  
  return {
    collection: 'users',
    documentCount: usersSnapshot.size
  };
}

/**
 * Export config collection (suggested tags, etc.)
 */
async function exportConfig(): Promise<BackupStats> {
  console.log(`\n📤 Exporting config...`);
  
  const configRef = collection(db, 'config');
  const configSnapshot = await getDocs(configRef);
  
  const config: Record<string, unknown> = {};
  
  for (const configDoc of configSnapshot.docs) {
    config[configDoc.id] = {
      id: configDoc.id,
      ...configDoc.data()
    };
  }
  
  const filePath = path.join(backupDir, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  
  console.log(`   ✅ ${configSnapshot.size} config documents exported`);
  
  return {
    collection: 'config',
    documentCount: configSnapshot.size
  };
}

/**
 * Create backup summary
 */
function createSummary(stats: BackupStats[]): void {
  const summary = {
    timestamp: new Date().toISOString(),
    projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
    collections: stats,
    totalDocuments: stats.reduce((sum, s) => sum + s.documentCount, 0)
  };
  
  const filePath = path.join(backupDir, 'backup-summary.json');
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
  
  console.log('\n📊 Backup Summary:');
  console.log(`   Project: ${summary.projectId}`);
  console.log(`   Timestamp: ${summary.timestamp}`);
  console.log(`   Total documents: ${summary.totalDocuments}`);
}

/**
 * Main backup function
 */
async function main(): Promise<void> {
  console.log('🔥 Firestore Backup Script');
  console.log('==========================\n');
  
  try {
    ensureBackupDir();
    
    const stats: BackupStats[] = [];
    
    // Export all collections
    stats.push(await exportRoutinesWithLogs());
    stats.push(await exportUsers());
    stats.push(await exportConfig());
    
    // Create summary
    createSummary(stats);
    
    console.log('\n✅ Backup complete!');
    console.log(`📁 Files saved to: ${backupDir}`);
    
  } catch (error) {
    console.error('\n❌ Backup failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
