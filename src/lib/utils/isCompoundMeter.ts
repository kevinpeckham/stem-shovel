/**
 * Whether a meter's beats divide in three: 6/8, 9/8, 12/8, 6/16 (an eighth
 * or sixteenth denominator and a numerator of 6 or more divisible by 3).
 * 3/8 is one beat a bar and stays simple; 7/8 is additive, not compound.
 */
export function isCompoundMeter(meter: string | null | undefined): boolean {
	const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
	if (!match) return false;
	const top = Number(match[1]);
	const bottom = Number(match[2]);
	return (bottom === 8 || bottom === 16) && top >= 6 && top % 3 === 0;
}
