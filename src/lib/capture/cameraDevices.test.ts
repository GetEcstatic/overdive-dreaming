import { describe, expect, it } from 'vitest';
import { classifyCameraLabel, usableCameraOptions } from './cameraDevices';

describe('classifyCameraLabel', () => {
	it('normalizes common iPhone rear lens labels', () => {
		expect(classifyCameraLabel('Back Ultra Wide Camera')).toMatchObject({
			facing: 'rear',
			displayLabel: 'Ultra wide'
		});
		expect(classifyCameraLabel('Back Camera')).toMatchObject({
			facing: 'rear',
			displayLabel: 'Rear camera'
		});
		expect(classifyCameraLabel('Back Telephoto Camera')).toMatchObject({
			facing: 'rear',
			displayLabel: 'Tele'
		});
	});

	it('identifies front and unknown cameras', () => {
		expect(classifyCameraLabel('Front Camera')).toMatchObject({
			facing: 'front',
			displayLabel: 'Front camera'
		});
		expect(classifyCameraLabel('')).toMatchObject({
			facing: 'unknown',
			displayLabel: 'Camera'
		});
	});
});

describe('usableCameraOptions', () => {
	it('hides front camera when rear cameras are present', () => {
		const options = usableCameraOptions([
			{
				deviceId: 'front',
				groupId: 'g1',
				kind: 'videoinput',
				label: 'Front Camera',
				toJSON: () => ({})
			},
			{
				deviceId: 'back',
				groupId: 'g1',
				kind: 'videoinput',
				label: 'Back Camera',
				toJSON: () => ({})
			}
		] as MediaDeviceInfo[]);

		expect(options).toHaveLength(1);
		expect(options[0].id).toBe('back');
	});
});
