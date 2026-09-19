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

<footer
	class="page-x-padding pt-4 pb-4 border-t border-white/10 text-11px flex flex-col gap-x-6 gap-y-10 sm:flex-row sm:flex-wrap sm:gap-y-2 justify-between"
>
	<!-- <span>Stem Shovel</span> -->
	<!-- Second on a phone (the links come first), first from sm up. -->
	<div class="flex flex-wrap gap-2 order-2 sm:order-1">
		<div class="opacity-70">Copyright 2026 Lightning Jar. All rights reserved.</div>
		<div class="opacity-70">|</div>
		<div class="opacity-70">
			<a
				class="inline hover-underline underline-offset-4 hover-text-maximumYellow"
				href="https://www.lightningjar.com">Built by ⚡️ Lightning Jar</a
			>
		</div>
		<div class="opacity-70">|</div>
		<div class="opacity-70 font-mono">
			<a
				class="inline hover-underline underline-offset-4 hover-text-maximumYellow"
				href={CHANGELOG}
				title="What changed in this version">{build}</a
			>
		</div>
	</div>

	<!-- Tappable on a phone: 15px links that wrap, above the copyright; the desktop keeps the small print. -->
	<div
		class="flex flex-wrap items-center gap-x-6 sm-gap-x-3 gap-y-3 text-15px order-1 sm:order-2 sm:gap-y-2 sm:text-11px"
	>
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
			href="/docs">Docs</a
		>
		<a
			class="underline underline-offset-4 hover:text-maximumYellow opacity-70 underline underline-offset-4 hover-text-maximumYellow"
			href="/releases">Releases</a
		>
		<a
			class="underline underline-offset-4 hover:text-maximumYellow opacity-70 underline underline-offset-4 hover-text-maximumYellow"
			href="/support">Help</a
		>
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
			href="/docs/privacy-policy">Privacy</a
		>
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
			href="/docs/copyright-policy">Copyright</a
		>
		{#if user}
			<button
				type="button"
				class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
				popovertarget="bug-report"
			>
				Report a bug
			</button>
			<a
				class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
				href="/feature-requests">Feature Requests</a
			>
		{/if}
		<!-- Rick Roll Easter Egg -->
		<a
			class="hidden sm-block underline underline-offset-4 hover:text-maximumYellow opacity-70 underline underline-offset-4 hover-text-maximumYellow"
			href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
			title="Click in case of emergency">RR</a
		>
	</div>
</footer>

{#if user}
	<ReportForm id="bug-report" kind="bug" {user} />
{/if}
