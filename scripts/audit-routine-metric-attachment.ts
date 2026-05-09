// Audit or backfill layer-derived metric tracking/display fields on routines.
// Usage:
//   tsx scripts/audit-routine-metric-attachment.ts
//   tsx scripts/audit-routine-metric-attachment.ts --write

import dotenv from 'dotenv';
import admin from 'firebase-admin';
import type { RoutineTemplate } from '../src/lib/types';
import { auditRoutineMetricAttachment, type RoutineMetricAttachmentAudit } from '../src/lib/routineLayers/attachmentAudit';

dotenv.config();

if (!admin.apps.length) {
	admin.initializeApp({
		projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID
	});
}

const db = admin.firestore();
const writeMode = process.argv.includes('--write');

type AuditStats = {
	checked: number;
	current: number;
	needsUpdate: number;
	notLayered: number;
	invalidLayers: number;
	written: number;
	errors: number;
};

const stats: AuditStats = {
	checked: 0,
	current: 0,
	needsUpdate: 0,
	notLayered: 0,
	invalidLayers: 0,
	written: 0,
	errors: 0
};

console.log('Routine metric attachment audit');
console.log(`Mode: ${writeMode ? 'write' : 'dry-run'}\n`);

const routinesSnap = await db.collection('routines').get();

for (const routineDoc of routinesSnap.docs) {
	stats.checked += 1;

	try {
		const routine = { id: routineDoc.id, ...routineDoc.data() } as RoutineTemplate;
		const audit = auditRoutineMetricAttachment(routine);
		recordStatus(audit, stats);

		if (audit.status !== 'needs-update') {
			continue;
		}

		printAudit(audit);

		if (writeMode && audit.updateProjection) {
			await routineDoc.ref.update({
				...stripUndefined(audit.updateProjection),
				updatedAt: admin.firestore.FieldValue.serverTimestamp()
			});
			stats.written += 1;
		}
	} catch (error) {
		stats.errors += 1;
		console.error(`Error auditing ${routineDoc.id}:`, error);
	}
}

console.log('\nSummary');
console.log(`  Checked:        ${stats.checked}`);
console.log(`  Current:        ${stats.current}`);
console.log(`  Needs update:   ${stats.needsUpdate}`);
console.log(`  Not layered:    ${stats.notLayered}`);
console.log(`  Invalid layers: ${stats.invalidLayers}`);
console.log(`  Written:        ${stats.written}${writeMode ? '' : ' (dry-run)'}`);
console.log(`  Errors:         ${stats.errors}`);

process.exit(stats.errors > 0 ? 1 : 0);

function recordStatus(audit: RoutineMetricAttachmentAudit, target: AuditStats): void {
	if (audit.status === 'current') target.current += 1;
	if (audit.status === 'needs-update') target.needsUpdate += 1;
	if (audit.status === 'not-layered') target.notLayered += 1;
	if (audit.status === 'invalid-layers') target.invalidLayers += 1;
}

function printAudit(audit: RoutineMetricAttachmentAudit): void {
	console.log(`\n${audit.routineName} (${audit.routineId})`);
	for (const diff of [...audit.trackingConfigChanges, ...audit.displayConfigChanges]) {
		console.log(`  ${diff.path}: ${formatValue(diff.current)} -> ${formatValue(diff.projected)}`);
	}
}

function formatValue(value: unknown): string {
	return value === undefined ? 'undefined' : JSON.stringify(value);
}

function stripUndefined<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((entry) => stripUndefined(entry)) as T;
	}

	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.map(([key, entry]) => [key, stripUndefined(entry)])
		) as T;
	}

	return value;
}
