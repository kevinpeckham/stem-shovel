/**
 * A stored amount as the text a member types back into the form: null → "",
 * 45050 → "450.50", 45000 → "450", -2000 → "-20" (the inverse of
 * `parseMoney`, without a currency sign or thousands commas).
 */
export function centsText(cents: number | null): string {
	if (cents === null) return "";
	const sign = cents < 0 ? "-" : "";
	const abs = Math.abs(cents);
	const units = Math.floor(abs / 100);
	const rest = abs % 100;
	return rest === 0 ? `${sign}${units}` : `${sign}${units}.${String(rest).padStart(2, "0")}`;
}
