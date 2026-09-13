import { type SongChangeKind, TIME_SIGNATURE_RE } from "$lib/constants/songChanges";

/** Per-kind check of the value text; null when it is fine, else the message. */
export function songChangeValueError(kind: SongChangeKind, value: string): string | null {
	const v = value.trim();
	if (!v) return "Enter a value.";
	if (kind === "tempo") {
		const n = Number(v);
		if (!Number.isFinite(n) || n < 20 || n > 400)
			return "Tempo is a number between 20 and 400 bpm.";
	} else if (kind === "key") {
		if (v.length > 20) return "Keep the key under 20 characters.";
	} else if (!TIME_SIGNATURE_RE.test(v)) return "Time signature looks like 4/4 or 6/8.";
	return null;
}
