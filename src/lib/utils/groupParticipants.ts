/**
 * Pure helpers for rendering "logged as group" indicators on feed
 * cards. The dashboard SessionCard uses {@link formatGroupParticipants}
 * to produce a compact "with Jane, Mark + 2 others" string that fits
 * under the author name without cluttering the rest of the card.
 *
 * Inputs are intentionally minimal so this can be unit tested without
 * pulling in Firestore types.
 */

export interface GroupParticipantsInput {
	/** Display name of the log's author. Filtered out of the names list. */
	authorDisplayName?: string;
	/** All participant names captured at log time (host + invitees). */
	participantNames?: string[];
	/** Total participant count, used as a fallback when names are missing. */
	participantCount?: number;
}

const MAX_NAMED = 2;

/**
 * Build the group label shown under the user's name. Returns `null`
 * when the log was not part of a group session, so the caller can skip
 * rendering entirely.
 */
export function formatGroupParticipants(input: GroupParticipantsInput): string | null {
	const { authorDisplayName, participantNames, participantCount } = input;

	const others = (participantNames ?? []).filter(
		(name) => name && name !== authorDisplayName
	);

	if (others.length === 0) {
		// Legacy logs may have a count but no names list. Fall back to a
		// generic "with N divers" label so the indicator is still visible.
		if (participantCount && participantCount >= 2) {
			const otherCount = participantCount - 1;
			return `with ${otherCount} other${otherCount === 1 ? '' : 's'}`;
		}
		return null;
	}

	const named = others.slice(0, MAX_NAMED);
	const remaining = others.length - named.length;

	if (remaining <= 0) {
		return `with ${named.join(', ')}`;
	}

	return `with ${named.join(', ')} + ${remaining} other${remaining === 1 ? '' : 's'}`;
}
