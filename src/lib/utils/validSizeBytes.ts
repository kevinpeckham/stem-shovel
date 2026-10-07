/**
 * A reserved upload's claimed size: a whole number of bytes from one up to
 * the cap, as the storage quota is checked against and the upload token is
 * capped at (a claim of one byte buys a one-byte upload, no more).
 */
export function validSizeBytes(value: unknown, cap: number): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= cap;
}
