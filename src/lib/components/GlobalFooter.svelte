<script lang="ts">
	import ReportForm from "#lib/components/ReportForm.svelte";
	import { page } from "$app/state";

	interface Props {
		user: { name: string; email: string } | null;
		/** Accounts the user belongs to, for the Idea Recorder link (the nav resolves the account the same way). */
		memberships?: { slug: string; actingAs?: boolean }[];
		currentSlug?: string | null;
	}
	let { user, memberships = [], currentSlug = null }: Props = $props();

	let own = $derived(memberships.filter((m) => !m.actingAs));
	let accountSlug = $derived(page.params.account ?? currentSlug ?? own[0]?.slug);
	let member = $derived(memberships.find((m) => m.slug === accountSlug));
	/** A member's recorder (the user's own page, outside the account's URLs); a visitor gets the working demo on the front page. */
	let recorderHref = $derived(member ? "/idea-recorder" : "/#idea-recorder");

	/** Which build is running: package.json's version and, when known, the commit. */
	const build = __BUILD_SHA__ ? `v${__APP_VERSION__} · ${__BUILD_SHA__}` : `v${__APP_VERSION__}`;
	const CHANGELOG = "/releases";
</script>

<footer class="page-x-padding pt-8 pb-12 border-t border-white/10">
	<!-- <span>Stem Shovel</span> -->

	<!-- The header's menus as rows of links, tappable on a phone (15px, wrapping): a member's music and management, the instruments, the tools, everything else under them. -->
	{#if member}
		<nav class="flex flex-wrap items-center gap-x-6 mb-4 gap-y-3 text-15px" aria-label="Music">
			<span class="text-11px uppercase tracking-wider opacity-60">Music</span>
			<a class="footer-link" href="/{member.slug}/projects">Projects</a>
			<a class="footer-link" href="/songs" title="Every song you can open, across your accounts"
				>Songs</a
			>
			<a class="footer-link" href="/{member.slug}/sessions" title="Practice and show recordings"
				>Sessions</a
			>
			<a class="footer-link" href="/idea-recorder" title="Your ideas and takes">Ideas</a>
		</nav>
		<nav class="flex flex-wrap items-center gap-x-6 mb-4 gap-y-3 text-15px" aria-label="Manage">
			<span class="text-11px uppercase tracking-wider opacity-60">Manage</span>
			<a
				class="footer-link"
				href="/{member.slug}/shows"
				title="The show calendar: upcoming and past">Shows</a
			>
			<a class="footer-link" href="/{member.slug}/practices" title="Rehearsals, scheduled and past"
				>Practices</a
			>
			<a class="footer-link" href="/{member.slug}/venues" title="Where you play and rehearse"
				>Venues</a
			>
			<a class="footer-link" href="/{member.slug}/practice-locations" title="Where you rehearse"
				>Practice locations</a
			>
			<a class="footer-link" href="/{member.slug}/set-lists" title="What to play, in order"
				>Set lists</a
			>
		</nav>
	{/if}
	<nav class="flex flex-wrap items-center gap-x-6 mb-4 gap-y-3 text-15px" aria-label="Instruments">
		<span class="text-11px uppercase tracking-wider opacity-60">Instruments</span>
		<a class="footer-link" href="/drum-machine">Drum Machine</a>
		<a class="footer-link" href="/piano">Piano</a>
		<a class="footer-link" href="/chord-player" title="Palette, the chord player">Palette</a>
	</nav>
	<nav class="flex flex-wrap items-center gap-x-6 mb-4 gap-y-3 text-15px" aria-label="Tools">
		<span class="text-11px uppercase tracking-wider opacity-60">Tools</span>
		<a class="footer-link" href={recorderHref} title="Lark, the idea recorder">Lark Idea Recorder</a
		>
		<a class="footer-link" href="/looper" title="Whirl, the looper">Whirl Looper</a>
		<a class="footer-link" href="/practice-amp" title="Ember, the practice amp"
			>Ember Practice Amp</a
		>
		{#if member}<a
				class="footer-link"
				href="/multitrack-recorder"
				title="Dawn, the multitrack studio">Dawn Multitrack Studio</a
			>
			<a
				class="footer-link"
				href="/{member.slug}/sessions/record"
				title="The room, in stereo, straight into the band's sessions">Session Recorder</a
			>{/if}
		<a class="footer-link" href="/tuner">Tuner</a>
		<a class="footer-link" href="/metronome">Metronome</a>
		<a class="footer-link" href="/convert" title="DAW project converter">Convert</a>
	</nav>
	<div class="flex flex-wrap items-center gap-x-6 mb-8 gap-y-3 text-15px">
		<span class="text-11px uppercase tracking-wider opacity-60">More</span>
		<a class="footer-link" href="/blog">Blog</a>
		<a class="footer-link" href="/docs">Docs</a>
		<a class="footer-link" href="/feature-requests">Feature Requests</a>
		<a class="footer-link" href="/support">Help</a>
		<a class="footer-link" href="/pricing">Pricing</a>
		<a class="footer-link" href="/releases">Releases</a>

		{#if user}
			<button type="button" class="footer-link" popovertarget="bug-report"> Report a bug </button>
		{/if}
		<!-- Rick Roll Easter Egg -->
		<!-- <a
				class="hidden sm-block underline underline-offset-4 hover:text-accent opacity-70 underline underline-offset-4 hover-text-accent"
				href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
				title="Click in case of emergency">RR</a
			> -->
	</div>

	<div class="flex flex-wrap items-center gap-x-4 text-12px mb-3">
		<div class="opacity-70">© 2026 Lightning Jar. All rights reserved.</div>
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-accent"
			href="/docs/privacy-policy">Privacy</a
		>
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-accent"
			href="/docs/copyright-policy">Copyright</a
		>
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-accent"
			href="/built-with">Built With</a
		>
	</div>

	<div class="flex flex-wrap gap-2 text-12px mb-2">
		<div class="opacity-70">
			<a
				class="inline hover-underline underline-offset-4 hover-text-accent"
				href="https://www.lightningjar.com">Built by ⚡️ Lightning Jar</a
			>
		</div>
		<div class="opacity-70">|</div>
		<div class="opacity-70 font-mono">
			<a
				class="inline hover-underline underline-offset-4 hover-text-accent"
				href={CHANGELOG}
				title="What changed in this version">{build}</a
			>
		</div>
	</div>
</footer>

{#if user}
	<ReportForm id="bug-report" kind="bug" {user} />
{/if}
