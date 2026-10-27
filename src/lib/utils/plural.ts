/** A count with its noun: "1 song", "3 songs"; pass `many` for an irregular plural. */
export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}
