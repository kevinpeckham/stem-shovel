<script lang="ts">
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * What Stem Shovel is made of, for the curious and for anyone who wants
	 * to run their own copy. Kept to what the app actually depends on
	 * (package.json, docs/environment.md); update it when the stack changes.
	 */
	const GROUPS: {
		title: string;
		blurb: string;
		items: { name: string; url: string; what: string }[];
	}[] = [
		{
			title: "The app",
			blurb: "A web app, so it runs in the browser you already have.",
			items: [
				{
					name: "SvelteKit",
					url: "https://svelte.dev/docs/kit",
					what: "The framework: pages, routing and the server in one place.",
				},
				{
					name: "Svelte 5",
					url: "https://svelte.dev",
					what: "The user interface, compiled to small, fast code.",
				},
				{
					name: "TypeScript",
					url: "https://www.typescriptlang.org",
					what: "Every line is typed, front and back.",
				},
				{
					name: "Vite+",
					url: "https://viteplus.dev",
					what: "Builds, tests, linting and formatting from one tool.",
				},
				{
					name: "UnoCSS",
					url: "https://unocss.dev",
					what: "Utility styling, generated only for what the pages use.",
				},
				{ name: "Phosphor Icons", url: "https://phosphoricons.com", what: "The icon set." },
				{
					name: "Noto Sans, Serif and Mono",
					url: "https://fonts.bunny.net",
					what: "The typefaces, chosen to read well at small sizes, served by Bunny Fonts (no tracking).",
				},
			],
		},
		{
			title: "Sound",
			blurb:
				"Playback, recording, the instruments and the Studio happen in the browser; conversion happens on the server.",
			items: [
				{
					name: "Web Audio API",
					url: "https://developer.mozilla.org/docs/Web/API/Web_Audio_API",
					what: "Plays every stem in sync from one clock, with the faders, mute and solo; the piano, drum machine, chord player, looper and the Studio's tracks and effects are built on it too.",
				},
				{
					name: "MediaRecorder",
					url: "https://developer.mozilla.org/docs/Web/API/MediaRecorder",
					what: "Records ideas and demos straight from the microphone.",
				},
				{
					name: "AudioWorklet",
					url: "https://developer.mozilla.org/docs/Web/API/AudioWorklet",
					what: "Captures the looper's loops and the Studio's takes sample by sample, lossless and lined up with the measured latency.",
				},
				{
					name: "Web MIDI API",
					url: "https://developer.mozilla.org/docs/Web/API/Web_MIDI_API",
					what: "Lets a MIDI keyboard or pad play the piano, the chord player and the drum machine, and record into the Studio's MIDI tracks.",
				},
				{
					name: "FFmpeg",
					url: "https://ffmpeg.org",
					what: "Makes the streaming renditions, the mixes and the downloads.",
				},
				{
					name: "Groovie's samples",
					url: "https://github.com/maximecb/groovie",
					what: "The drum machine's Acoustic and Room kits: public-domain (CC0) one-shots from Maxime Chevalier-Boisvert's beat sequencer.",
				},
				{
					name: "Salamander Grand Piano",
					url: "https://github.com/sfzinstruments/SalamanderGrandPiano",
					what: "The piano's Grand Piano: Alexander Holm's recordings of a Yamaha C5, CC BY 3.0, in the mp3 subset Tone.js publishes.",
				},
				{
					name: "Finger Bass YR",
					url: "https://github.com/freepats/electric-bass-YR",
					what: "The piano's Electric Bass: Andrea Biasior's recordings of a Yamaha RBX for the FreePats project, CC0 public domain, twelve notes shifted by octaves.",
				},
				{
					name: "Spanish classical guitar",
					url: "https://github.com/freepats/spanish-classical-guitar",
					what: "The piano's Acoustic Guitar: Roberto's 2008 recordings of a Spanish classical guitar for the FreePats project, CC0 public domain, forty-eight notes.",
				},
				{
					name: "Fifths, the chord player",
					url: "https://github.com/kevinpeckham/chord-player",
					what: "The Chord Player's circle of fifths grew out of Kevin's earlier instrument, itself inspired by Quinn Raymond's Q-RAY chord player, with the circle's SVG after Eric Coleman and Håken Lid.",
				},
				{
					name: "Basic Pitch",
					url: "https://github.com/spotify/basic-pitch",
					what: "Spotify's open-source model that turns a recorded idea into notes.",
				},
				{ name: "TensorFlow.js", url: "https://www.tensorflow.org/js", what: "Runs that model." },
				{
					name: "Verovio",
					url: "https://www.verovio.org",
					what: "Engraves transcribed notes as sheet music for the notation PDF.",
				},
				{
					name: "Our own code",
					url: "https://github.com/kevinpeckham/stem-shovel",
					what: "Tempo, key and time signature from the stems, the tuner's pitch detection, the synth voices and the electronic drum kit, the effects, and the MIDI files the Studio reads and writes, all written for Stem Shovel.",
				},
			],
		},
		{
			title: "Data and files",
			blurb: "Where songs, stems and settings live.",
			items: [
				{ name: "Turso", url: "https://turso.tech", what: "The database (SQLite, hosted)." },
				{
					name: "Drizzle",
					url: "https://orm.drizzle.team",
					what: "How the app talks to it, with migrations kept in the repository.",
				},
				{
					name: "Vercel Blob",
					url: "https://vercel.com/storage/blob",
					what: "Stores the audio files, private ones behind signed access.",
				},
				{
					name: "Upstash Redis",
					url: "https://upstash.com",
					what: "Rate limits and short-lived state.",
				},
				{
					name: "IndexedDB",
					url: "https://developer.mozilla.org/docs/Web/API/IndexedDB_API",
					what: "Keeps the looper's loop and the Idea Recorder's and the Studio's takes in your browser while they wait to upload, so a dropped connection loses nothing.",
				},
				{
					name: "fflate",
					url: "https://github.com/101arrowz/fflate",
					what: "Zips the stems for a download, in the browser.",
				},
				{
					name: "Valibot",
					url: "https://valibot.dev",
					what: "Checks every form and request before it touches the database.",
				},
			],
		},
		{
			title: "Accounts and mail",
			blurb: "Signing in, staying safe and hearing from us.",
			items: [
				{
					name: "Better Auth",
					url: "https://www.better-auth.com",
					what: "Accounts, sessions, two-factor sign-in and passkeys.",
				},
				{
					name: "Resend",
					url: "https://resend.com",
					what: "Sends the invitations, verification and notification email.",
				},
				{
					name: "node-qrcode",
					url: "https://github.com/soldair/node-qrcode",
					what: "Draws the code an authenticator app scans when two-factor sign-in is set up.",
				},
			],
		},
		{
			title: "Writing",
			blurb: "Charts, lyrics, notes, the docs and this blog.",
			items: [
				{
					name: "woof-editor",
					url: "https://github.com/kevinpeckham/woof-editor",
					what: "The markdown editor, built by Lightning Jar.",
				},
				{
					name: "barkdown and marked",
					url: "https://marked.js.org",
					what: "Turn markdown into pages, with footnotes.",
				},
				{
					name: "DOMPurify",
					url: "https://github.com/cure53/DOMPurify",
					what: "Cleans anything rendered from user text.",
				},
				{
					name: "PDFKit and pdf-lib",
					url: "https://pdfkit.org",
					what: "Make the PDFs: charts, notes and sheet music.",
				},
				{
					name: "PDF.js",
					url: "https://mozilla.github.io/pdf.js",
					what: "Draws the first page of an attached PDF as its thumbnail.",
				},
			],
		},
		{
			title: "Optional AI",
			blurb:
				"The song analysis asks a model only when an account turns that on; the beat and chord generators ask one when you ask them. Never your recordings without asking.",
			items: [
				{
					name: "Vercel AI Gateway and the AI SDK",
					url: "https://vercel.com/ai-gateway",
					what: "One door to the models, so no key of ours sits with any one provider.",
				},
				{
					name: "Gemini, Claude and Kimi",
					url: "https://vercel.com/ai-gateway",
					what: "Gemini listens to a close-call time signature, Claude reads transcribed notes, and Kimi turns a line of text into a beat or a chord progression.",
				},
			],
		},
		{
			title: "Running it",
			blurb: "Hosting, secrets, monitoring and the checks every change passes.",
			items: [
				{
					name: "Vercel",
					url: "https://vercel.com",
					what: "Hosts the app, its background jobs and the daily digest.",
				},
				{
					name: "1Password and varlock",
					url: "https://varlock.dev",
					what: "Every secret lives in 1Password and is loaded at build and run time; none in files.",
				},
				{ name: "Sentry", url: "https://sentry.io", what: "Tells us when something breaks." },
				{
					name: "Vercel Analytics and Speed Insights",
					url: "https://vercel.com/analytics",
					what: "Page counts and speed, without cookies.",
				},
				{
					name: "GitHub Actions, Vitest and Playwright",
					url: "https://github.com/kevinpeckham/stem-shovel/actions",
					what: "Tests, type checks, lint, spelling, dead-code and house-rule checks, secret scanning and a code review on every change.",
				},
			],
		},
	];
</script>

<svelte:head>
	<title>{pageTitle("Built with")}</title>
	<meta
		name="description"
		content="What Stem Shovel is made of: SvelteKit and Svelte 5, the Web Audio and Web MIDI APIs, FFmpeg, Verovio, Turso and Drizzle, Vercel Blob, Better Auth, Resend and Vercel, all open source where it can be."
	/>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-2">
		<h1 class="heading-2">Built with</h1>
		<p class="opacity-90 text-balance">
			Stem Shovel is open source and made mostly of other open-source work. This is the list, for
			the curious and for anyone who wants to run their own copy. The code is on
			<a class="link-dim" href="https://github.com/kevinpeckham/stem-shovel">GitHub</a>.
		</p>
	</header>

	<div class="grid gap-8 max-w-4xl">
		{#each GROUPS as group (group.title)}
			<section aria-labelledby="built-{group.title}">
				<h2 id="built-{group.title}" class="marketing-section-heading mb-1">{group.title}</h2>
				<p class="mb-3 text-sm opacity-80">{group.blurb}</p>
				<ul class="grid gap-2 sm:grid-cols-2">
					{#each group.items as item (item.name)}
						<li class="marketing-box pb-3">
							<a
								class="font-600 text-white hover:text-accent hover:underline underline-offset-4"
								href={item.url}
								rel="noopener">{item.name}</a
							>
							<p class="mt-1 text-sm opacity-80">{item.what}</p>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>

	<p class="max-w-article text-13px text-dim">
		Built by <a class="link-dim" href="https://www.lightningjar.com">Lightning Jar</a>, a small web
		studio, as a side project for its own bands.
	</p>
</main>
