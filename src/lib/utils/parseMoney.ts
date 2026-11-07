/** Whole units, plain or grouped by thousands with commas, then up to two decimals. */
const MONEY = /^(-?)(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/;

/**
 * A typed amount as integer cents, or null when it does not read as one:
 * "450" → 45000, "450.5" → 45050, "$1,234.50" → 123450, "-20" → -2000;
 * more than two decimals, letters or "" → null. A currency sign ($, €, £)
 * and spaces are ignored; the minus may come before or after the sign.
 */
export function parseMoney(text: string): number | null {
	const plain = text.replace(/[\s$€£]/g, "");
	const m = MONEY.exec(plain);
	if (!m) return null;
	const [, minus, whole, decimals = ""] = m;
	const units = whole.replace(/,/g, "");
	if (units === "" && decimals === "") return null;
	if (units.length > 12) return null;
	const cents = Number(units || "0") * 100 + Number(decimals.padEnd(2, "0"));
	return minus && cents !== 0 ? -cents : cents;
}
