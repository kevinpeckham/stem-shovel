/**
 * The chord player's own domains (fifths.app, chordplayer.dev, with or
 * without www) send every path to the chord player on the main site, from
 * the server hook so it holds whatever Vercel makes of vercel.json's
 * redirects. Null for any other host.
 */
const VANITY_HOSTS: Record<string, string> = {
	"fifths.app": "https://www.stemshovel.com/chord-player",
	"chordplayer.dev": "https://www.stemshovel.com/chord-player",
};

export function vanityHostTarget(host: string): string | null {
	const bare = host
		.toLowerCase()
		.replace(/:\d+$/, "")
		.replace(/^www\./, "");
	return VANITY_HOSTS[bare] ?? null;
}
