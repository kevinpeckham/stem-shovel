/**
 * Verovio's SVG before it goes into the page: the engine writes only
 * drawing primitives and escaped text, but the file it read was a user's,
 * so scripts, event handlers, foreign objects and javascript: links are
 * stripped as belt and braces (docs/security.md).
 */
export function sanitizeSvg(svg: string): string {
	return svg
		.replace(/<script[\s\S]*?<\/script\s*>/gi, "")
		.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
		.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
		.replace(/(\s(?:xlink:)?href\s*=\s*["']?)\s*javascript:[^"'\s>]*/gi, "$1#");
}
