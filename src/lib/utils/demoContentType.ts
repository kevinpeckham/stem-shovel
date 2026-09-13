import { DEMO_FORMATS } from "$lib/constants/demoFormats";

export function demoContentType(filename: string): string | null {
	const ext = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
	return ext ? (DEMO_FORMATS[ext] ?? null) : null;
}
