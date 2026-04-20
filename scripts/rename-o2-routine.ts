/**
 * Rename "O₂ Assisted Static" routine to "Zero-Nitrogen Static" for all users
 * 
 * Updates:
 * 1. System routine template document
 * 2. All user routine copies that reference this routine
 * 
 * Usage:
 *   npx tsx scripts/rename-o2-routine.ts [--dry-run]
 */

import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID
  });
}

const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const ROUTINE_ID = 'system-o2-assisted-static';
const NEW_NAME = 'Zero-Nitrogen Static';
const NEW_DESCRIPTION = 'Zero-nitrogen static apnea max attempt with comprehensive physiological tracking. Designed for coached world record training with detailed breathe-up, lung capacity, CO₂ response, and recovery metrics.';

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Renaming routine ${ROUTINE_ID} to "${NEW_NAME}"...\n`);

  // 1. Update system routine template
  const routineRef = db.collection('routines').doc(ROUTINE_ID);
  const routineDoc = await routineRef.get();
  
  if (routineDoc.exists) {
    console.log(`Found system routine: "${routineDoc.data()?.name}"`);
    if (!DRY_RUN) {
      await routineRef.update({ name: NEW_NAME, description: NEW_DESCRIPTION });
      console.log(`  ✅ Updated system routine name to "${NEW_NAME}"`);
    } else {
      console.log(`  Would update name to "${NEW_NAME}"`);
    }
  } else {
    console.log('System routine not found in routines collection');
  }

  // 2. Update all user copies of this routine
  const usersSnap = await db.collection('users').get();
  let userUpdates = 0;

  for (const userDoc of usersSnap.docs) {
    const userRoutineRef = db.collection('users').doc(userDoc.id).collection('routines').doc(ROUTINE_ID);
    const userRoutineDoc = await userRoutineRef.get();
    
    if (userRoutineDoc.exists) {
      const currentName = userRoutineDoc.data()?.name;
      console.log(`  User ${userDoc.id}: found routine "${currentName}"`);
      if (!DRY_RUN) {
        await userRoutineRef.update({ name: NEW_NAME, description: NEW_DESCRIPTION });
        console.log(`    ✅ Updated to "${NEW_NAME}"`);
      } else {
        console.log(`    Would update to "${NEW_NAME}"`);
      }
      userUpdates++;
    }
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Done. Updated ${userUpdates} user routine copies.`);
}

main().catch(console.error);
