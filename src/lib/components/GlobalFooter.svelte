<script lang="ts">
	import ReportForm from "$lib/components/ReportForm.svelte";

	interface Props {
		user: { name: string; email: string } | null;
	}
	let { user }: Props = $props();

	/** Which build is running: package.json's version and, when known, the commit. */
	const build = __BUILD_SHA__ ? `v${__APP_VERSION__} · ${__BUILD_SHA__}` : `v${__APP_VERSION__}`;
	const CHANGELOG = "/releases";
</script>

<footer class="page-x-padding pt-8 pb-12 border-t border-white/10">
	<!-- <span>Stem Shovel</span> -->

	<!-- Tappable on a phone: 15px links that wrap, above the copyright; the desktop keeps the small print. -->
	<div class="flex flex-wrap items-center gap-x-6 mb-8 gap-y-3 text-15px">
		<a class="footer-link" href="/docs">Docs</a>
		<a class="footer-link" href="/releases">Releases</a>
		<a class="footer-link" href="/tuner">Tuner</a>
		<a class="footer-link" href="/pricing">Pricing</a>
		<a class="footer-link" href="/blog">Blog</a>
		<a class="footer-link" href="/support">Help</a>

		{#if user}
			<button type="button" class="footer-link" popovertarget="bug-report"> Report a bug </button>
			<a class="footer-link" href="/feature-requests">Feature Requests</a>
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
