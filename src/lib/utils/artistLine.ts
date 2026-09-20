/** Names as a credit line: "A", "A & B", "A, B & C". Empty for no names. */
export function artistLine(names: string[]): string {
	const clean = names.map((n) => n.trim()).filter(Boolean);
	if (clean.length <= 1) return clean[0] ?? "";
	return `${clean.slice(0, -1).join(", ")} & ${clean[clean.length - 1]}`;
}
