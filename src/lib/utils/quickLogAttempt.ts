import type { AttemptCategoryKind, AttemptConditions, BreathingGas, LungVolume } from '$lib/types';
import { DEFAULT_O2_GAS_MIX, defaultConditionsForKind } from './attemptCategories';

export type QuickLogAttemptInput = {
	attemptKind: AttemptCategoryKind;
	customAttemptLabel?: string;
	breathingGas: BreathingGas;
	gasMix?: string;
	defaultLungVolume?: LungVolume;
};

export function buildQuickLogAttemptConditions(input: QuickLogAttemptInput): AttemptConditions {
	const effectiveKind = resolveEffectiveAttemptKind(input.attemptKind, input.defaultLungVolume);
	const trimmedGasMix = input.gasMix?.trim() || undefined;
	const trimmedCustomLabel = input.customAttemptLabel?.trim() || undefined;
	const usesBreathingGas = effectiveKind === 'o2-assisted' || effectiveKind === 'custom';
	const breathingGas = usesBreathingGas ? input.breathingGas : 'air';
	const gasMix = effectiveKind === 'o2-assisted'
		? trimmedGasMix ?? DEFAULT_O2_GAS_MIX
		: effectiveKind === 'custom'
			? trimmedGasMix
			: undefined;
	const base = defaultConditionsForKind(effectiveKind, {
		label: trimmedCustomLabel,
		breathingGas,
		gasMix,
		lungVolume: input.defaultLungVolume
	});

	return {
		...base,
		label: effectiveKind === 'custom' ? trimmedCustomLabel : base.label,
		breathingGas,
		gasMix,
		lungVolume: input.defaultLungVolume ?? base.lungVolume
	};
}

function resolveEffectiveAttemptKind(kind: AttemptCategoryKind, lungVolume?: LungVolume): AttemptCategoryKind {
	if (kind !== 'standard') return kind;
	if (lungVolume === 'FRC') return 'frc';
	if (lungVolume === 'RV') return 'rv';
	return 'standard';
}