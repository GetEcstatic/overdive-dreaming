import type { CameraFacing, CameraPreference } from '$lib/types';

export interface CameraDeviceOption {
	id: string;
	label: string;
	rawLabel: string;
	kind: 'videoinput';
	facing: CameraFacing;
	confidence: 'explicit-label' | 'inferred-label' | 'unknown';
}

export interface CameraDeviceState {
	permission: 'unknown' | 'granted' | 'denied';
	options: CameraDeviceOption[];
	selected: CameraPreference;
	activeDeviceId?: string;
	activeLabel?: string;
	errorMessage?: string;
}

export const AUTO_REAR_CAMERA: CameraPreference = { kind: 'auto-rear' };

export function classifyCameraLabel(label: string): {
	facing: CameraFacing;
	displayLabel: string;
	confidence: CameraDeviceOption['confidence'];
} {
	const raw = label.trim();
	const normalized = raw.toLowerCase();
	if (!raw) {
		return { facing: 'unknown', displayLabel: 'Camera', confidence: 'unknown' };
	}

	const isFront =
		/\b(front|user|selfie|facetime)\b/.test(normalized) &&
		!/\b(back|rear|environment)\b/.test(normalized);
	if (isFront) {
		return { facing: 'front', displayLabel: 'Front camera', confidence: 'explicit-label' };
	}

	const hasRear = /\b(back|rear|environment)\b/.test(normalized);
	const hasUltraWide = /ultra[\s-]?wide|0\.5x/.test(normalized);
	const hasTele = /tele(photo)?|3x|5x/.test(normalized);
	const hasWide = /\bwide\b|1x/.test(normalized);

	if (hasUltraWide) {
		return { facing: 'rear', displayLabel: 'Ultra wide', confidence: 'explicit-label' };
	}
	if (hasTele) {
		return { facing: 'rear', displayLabel: 'Tele', confidence: 'explicit-label' };
	}
	if (hasRear && hasWide) {
		return { facing: 'rear', displayLabel: 'Wide', confidence: 'explicit-label' };
	}
	if (hasRear) {
		return { facing: 'rear', displayLabel: 'Rear camera', confidence: 'explicit-label' };
	}
	if (hasWide) {
		return { facing: 'rear', displayLabel: 'Wide', confidence: 'inferred-label' };
	}

	return { facing: 'unknown', displayLabel: raw, confidence: 'unknown' };
}

export function cameraPreferenceLabel(
	preference: CameraPreference,
	activeLabel?: string
): string {
	if (preference.kind === 'auto-rear') return activeLabel ?? 'Auto rear';
	return preference.label ?? activeLabel ?? 'Camera';
}

export function cameraPreferenceMatches(
	preference: CameraPreference,
	option: CameraDeviceOption
): boolean {
	return preference.kind === 'device' && preference.deviceId === option.id;
}

export function optionToPreference(option: CameraDeviceOption): CameraPreference {
	return { kind: 'device', deviceId: option.id, label: option.label };
}

export function usableCameraOptions(devices: MediaDeviceInfo[]): CameraDeviceOption[] {
	const videoInputs = devices.filter((device) => device.kind === 'videoinput');
	const classified = videoInputs.map((device, index) => {
		const label = device.label.trim();
		const classifiedLabel = classifyCameraLabel(label);
		return {
			id: device.deviceId,
			label:
				classifiedLabel.displayLabel === 'Camera'
					? `Camera ${index + 1}`
					: classifiedLabel.displayLabel,
			rawLabel: label,
			kind: 'videoinput' as const,
			facing: classifiedLabel.facing,
			confidence: classifiedLabel.confidence
		};
	});

	const rear = classified.filter((option) => option.facing === 'rear');
	if (rear.length > 0) return dedupeLabels(rear);
	return dedupeLabels(classified.filter((option) => option.facing !== 'front'));
}

function dedupeLabels(options: CameraDeviceOption[]): CameraDeviceOption[] {
	const counts = new Map<string, number>();
	return options.map((option) => {
		const count = (counts.get(option.label) ?? 0) + 1;
		counts.set(option.label, count);
		return count === 1 ? option : { ...option, label: `${option.label} ${count}` };
	});
}

export async function enumerateCameraDevices(): Promise<CameraDeviceOption[]> {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
		return [];
	}
	const devices = await navigator.mediaDevices.enumerateDevices();
	return usableCameraOptions(devices);
}
