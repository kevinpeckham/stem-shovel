/** 1 → "I", 4 → "IV", 12 → "XII"; the default index of a new song section. */
export function toRoman(n: number): string {
	if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n);
	const table: [number, string][] = [
		[1000, "M"],
		[900, "CM"],
		[500, "D"],
		[400, "CD"],
		[100, "C"],
		[90, "XC"],
		[50, "L"],
		[40, "XL"],
		[10, "X"],
		[9, "IX"],
		[5, "V"],
		[4, "IV"],
		[1, "I"],
	];
	let out = "";
	for (const [value, glyph] of table)
		while (n >= value) {
			out += glyph;
			n -= value;
		}
	return out;
}
