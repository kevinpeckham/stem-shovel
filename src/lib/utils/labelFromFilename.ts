/** Filename minus extension, used as the default stem label. */
export function labelFromFilename(filename: string): string {
	const base = filename.split(/[/\\]/).pop() ?? filename;
	return base.replace(/\.[^.]+$/, "") || base;
}
