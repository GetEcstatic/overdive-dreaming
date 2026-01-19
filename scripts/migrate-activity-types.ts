/**
 * Migration Script: Add Activity Types to Existing Routines
 * 
 * This script infers and adds the `activityType` field to existing routines
 * that don't have one set. It also adds calculated speed fields to interval logs.
 * 
 * RUN BACKUP FIRST: npm run backup
 * 
 * Usage:
 *   npx ts-node scripts/migrate-activity-types.ts [--dry-run]
 *   
 * Options:
 *   --dry-run   Show what would be changed without actually updating Firestore
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { ActivityType, RoutineTemplate, RoutineLog } from '../src/lib/types';

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
  console.error('Set it to the path of your Firebase service account JSON file');
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccountPath)
});

const db = getFirestore(app);

// Check for dry run flag
const isDryRun = process.argv.includes('--dry-run');
if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made to Firestore\n');
}

/**
 * Infer activity type from existing routine data
 * Uses tags, protocolType, and table structure to make educated guess
 */
function inferActivityType(routine: RoutineTemplate): ActivityType {
  const tags = routine.tags || [];
  const tagsLower = tags.map(t => t.toLowerCase());
  
  // Check tags for hints
  if (tagsLower.includes('max') || tagsLower.includes('pb-attempt') || tagsLower.includes('max-attempt')) {
    return 'max-attempt';
  }
  
  if (tagsLower.includes('submax') || tagsLower.includes('warmup') || tagsLower.includes('submax-attempt')) {
    return 'submax-attempt';
  }
  
  if (tagsLower.includes('free') || tagsLower.includes('free-training') || tagsLower.includes('unstructured')) {
    return 'free-training';
  }
  
  // Check protocol structure
  if (routine.protocolType === 'table' || routine.table) {
    // Has defined table structure = structured intervals
    return 'structured-intervals';
  }
  
  if (routine.protocolType === 'uniform' || routine.numberOfReps || routine.restBetweenReps) {
    // Has uniform rep structure
    // Check tags for specific patterns
    if (tagsLower.includes('co2') || tagsLower.includes('o2')) {
      return 'structured-intervals';
    }
    // Generic intervals
    return 'freeform-intervals';
  }
  
  // Default based on training type tags
  if (tagsLower.includes('interval') || tagsLower.includes('intervals')) {
    return 'freeform-intervals';
  }
  
  // No clear structure = free training
  return 'free-training';
}

/**
 * Calculate speed for a dynamic log
 */
function calculateSpeed(distance: number | undefined, time: number | undefined): number | undefined {
  if (!distance || !time || time === 0) return undefined;
  return distance / time;
}

/**
 * Migrate routine templates to add activityType
 */
async function migrateRoutineTemplates(): Promise<{ updated: number; skipped: number; errors: number }> {
  console.log('\n📋 Migrating Routine Templates...\n');
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  try {
    const routinesSnapshot = await db.collection('routines').get();
    
    for (const routineDoc of routinesSnapshot.docs) {
      try {
        const routine = routineDoc.data() as RoutineTemplate;
        
        // Skip if already has activityType
        if (routine.activityType) {
          console.log(`  ⏭  ${routine.name}: already has activityType (${routine.activityType})`);
          skipped++;
          continue;
        }
        
        // Infer activity type
        const inferredType = inferActivityType(routine);
        
        console.log(`  → ${routine.name}: ${inferredType}`);
        console.log(`    Tags: [${routine.tags?.join(', ') || 'none'}]`);
        console.log(`    Protocol: ${routine.protocolType || 'none'}, Table: ${routine.table ? 'yes' : 'no'}`);
        
        if (!isDryRun) {
          await db.collection('routines').doc(routineDoc.id).update({
            activityType: inferredType,
            updatedAt: Timestamp.now()
          });
        }
        
        updated++;
      } catch (err) {
        console.error(`  ✗ Error updating ${routineDoc.id}:`, err);
        errors++;
      }
    }
  } catch (err) {
    console.error('Error reading routines collection:', err);
    throw err;
  }
  
  return { updated, skipped, errors };
}

/**
 * Migrate routine logs to add calculated fields
 */
async function migrateRoutineLogs(): Promise<{ updated: number; skipped: number; errors: number }> {
  console.log('\n📊 Migrating Routine Logs (adding calculated fields)...\n');
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  try {
    const routinesSnapshot = await db.collection('routines').get();
    
    for (const routineDoc of routinesSnapshot.docs) {
      const routine = routineDoc.data() as RoutineTemplate;
      const logsSnapshot = await db.collection('routines').doc(routineDoc.id).collection('logs').get();
      
      for (const logDoc of logsSnapshot.docs) {
        try {
          const log = logDoc.data() as RoutineLog;
          const updates: Record<string, unknown> = {};
          
          // Add avgSpeed if not present and we have distance + time
          if (log.avgSpeed === undefined && log.totalDistance && log.totalTime) {
            const speed = calculateSpeed(log.totalDistance, log.totalTime);
            if (speed !== undefined) {
              updates.avgSpeed = speed;
            }
          }
          
          // Add cumulativeHoldTime for STA intervals if we have laps
          if (log.cumulativeHoldTime === undefined && log.laps && log.laps.length > 0) {
            const cumulative = log.laps.reduce((sum, lap) => sum + (lap.timeSeconds || 0), 0);
            if (cumulative > 0) {
              updates.cumulativeHoldTime = cumulative;
            }
          }
          
          // Calculate per-rep speeds for dynamic intervals with laps
          if (log.laps && log.laps.length > 0 && log.repDistance) {
            const repSpeeds: number[] = [];
            for (const lap of log.laps) {
              if (lap.timeSeconds && lap.timeSeconds > 0) {
                const distance = lap.distanceMeters || log.repDistance;
                repSpeeds.push(distance / lap.timeSeconds);
              }
            }
            
            if (repSpeeds.length > 0) {
              if (log.maxRepSpeed === undefined) {
                updates.maxRepSpeed = Math.max(...repSpeeds);
              }
              if (log.minRepSpeed === undefined) {
                updates.minRepSpeed = Math.min(...repSpeeds);
              }
            }
          }
          
          // Skip if no updates needed
          if (Object.keys(updates).length === 0) {
            skipped++;
            continue;
          }
          
          console.log(`  → ${routine.name} / Log ${logDoc.id}`);
          console.log(`    Adding: ${Object.keys(updates).join(', ')}`);
          
          if (!isDryRun) {
            updates.updatedAt = Timestamp.now();
            await db.collection('routines')
              .doc(routineDoc.id)
              .collection('logs')
              .doc(logDoc.id)
              .update(updates);
          }
          
          updated++;
        } catch (err) {
          console.error(`  ✗ Error updating log ${logDoc.id}:`, err);
          errors++;
        }
      }
    }
  } catch (err) {
    console.error('Error reading routines/logs:', err);
    throw err;
  }
  
  return { updated, skipped, errors };
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('='.repeat(60));
  console.log('  Activity Type Migration Script');
  console.log('='.repeat(60));
  
  if (isDryRun) {
    console.log('\n⚠️  DRY RUN: No data will be modified\n');
  } else {
    console.log('\n⚠️  LIVE RUN: Data will be modified in Firestore');
    console.log('    Make sure you have run: npm run backup\n');
  }
  
  const routineResults = await migrateRoutineTemplates();
  const logResults = await migrateRoutineLogs();
  
  console.log('\n' + '='.repeat(60));
  console.log('  Migration Summary');
  console.log('='.repeat(60));
  
  console.log('\nRoutine Templates:');
  console.log(`  Updated: ${routineResults.updated}`);
  console.log(`  Skipped: ${routineResults.skipped}`);
  console.log(`  Errors:  ${routineResults.errors}`);
  
  console.log('\nRoutine Logs:');
  console.log(`  Updated: ${logResults.updated}`);
  console.log(`  Skipped: ${logResults.skipped}`);
  console.log(`  Errors:  ${logResults.errors}`);
  
  const totalErrors = routineResults.errors + logResults.errors;
  if (totalErrors > 0) {
    console.log(`\n⚠️  ${totalErrors} errors occurred during migration`);
    process.exit(1);
  } else if (isDryRun) {
    console.log('\n✅ Dry run complete. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Migration complete!');
  }
}

// Run the migration
runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
