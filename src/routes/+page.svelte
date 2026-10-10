<script lang="ts">
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import SongDocsDemo from "#lib/components/SongDocsDemo.svelte";
	import SongPlayerDemo from "#lib/components/SongPlayerDemo.svelte";
	import IdeaRecorderDemo from "#lib/components/IdeaRecorderDemo.svelte";
	import WaitlistForm from "#lib/components/WaitlistForm.svelte";
	import { exampleComments } from "#lib/constants/demoComments.js";
	import Tuner from "#lib/components/Tuner.svelte";
	import Metronome from "#lib/components/Metronome.svelte";
	import DrumMachine from "#lib/components/DrumMachine.svelte";
	import ChordPlayer from "#lib/components/ChordPlayer.svelte";
	import Piano from "#lib/components/Piano.svelte";
	import { chordPiano, piano } from "#lib/audio/piano.svelte.js";
	import { drumMachine } from "#lib/audio/drumMachine.svelte.js";
	import { visibleShare } from "#lib/utils/visibleShare.js";

	let { data } = $props();
	// The demos' comments: examples plus whatever the visitor adds, kept in this page only.
	let demoComments = $state(exampleComments());

	// The tools section shows one of its two demos at a time, the tuner first.
	const TOOLS = [
		{ id: "tuner", name: "Guitar Tuner" },
		{ id: "metronome", name: "Metronome" },
	] as const;
	let tool = $state<(typeof TOOLS)[number]["id"]>("tuner");

	// The keyboard goes to the demo the visitor is looking at: the stem player,
	// the drum machine or the piano, whichever shows more of itself, once at
	// least half of it (or half a screen of it) is on screen; none otherwise, so
	// space scrolls the page as usual and a sliver at the edge takes nothing.
	let playerShare = $state(0);
	let drumsShare = $state(0);
	let pianoShare = $state(0);
	let chordsShare = $state(0);
	let spaceTarget = $derived.by(() => {
		const shares = {
			player: playerShare,
			drums: drumsShare,
			piano: pianoShare,
			chords: chordsShare,
		};
		const [best, share] = Object.entries(shares).sort((a, b) => b[1] - a[1])[0]!;
		return share < 0.5 ? null : best;
	});

	// The page's words are the "home-page" copy doc (docs/page-copy.md); a section the doc lacks is the seed file's.
	const copy = $derived(data.copy);
	const EMPTY = { heading: "", paragraphs: [], items: [] };
	const section = (id: string) => copy.sections[id] ?? EMPTY;
	const description = $derived(copy.intro);
	// The FAQ's "How do I get started?" has an answer for open sign-up and one for invitations.
	const faqs = $derived(
		section("faq").items.filter(
			(i) => i.id !== (data.signUpOpen ? "start-waitlist" : "start-open"),
		),
	);
</script>

<svelte:head>
	<title
		>{pageTitle(
			"Stem Shovel | Stem Sharing & Collaboration tool for musicians, bands and producers",
			true,
		)}</title
	>
	<meta name="description" content={description} />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href="https://www.stemshovel.com/" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Stem Shovel" />
	<meta property="og:title" content="Stem Shovel" />
	<meta property="og:description" content={description} />
	<meta property="og:url" content="https://www.stemshovel.com/" />
	<meta
		property="og:image"
		content="https://www.stemshovel.com/images/stem-shovel-screenshot-01.webp"
	/>
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{#snippet feature(id: string)}
	{@const s = section(id)}
	<h3 class="marketing-section-heading">{s.heading}</h3>
	{#if s.items[0]}
		<div class="marketing-topic-heading">{s.items[0].heading}</div>
	{/if}
	{#each [...s.paragraphs, ...s.items.flatMap((i) => i.paragraphs)] as html, i (i)}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown rendered server-side from the copy doc (never user text) -->
		<p class="marketing-paragraph text-balance">{@html html}</p>
	{/each}
{/snippet}

<main class="home-page-x-padding pt-4 pb-16 min-h-full">
	<div class="border-b border-b-current/10 pt-6 pb-2 mb-8">
		<!-- <h1 class="heading-2 mb-2">Introducing Stem Shovel</h1> -->
		<h1 class="block marketing-headline">{copy.title}</h1>
		<div class="mt-8 flex flex-wrap gap-4 items-baseline">
			{#if data.user}
				<!-- {#each data.memberships as m (m.accountId)}
					<a class="button-accent" href="/{m.slug}/projects">{m.name} →</a>
				{/each} -->
			{:else if data.signUpOpen}
				<a class="button-accent-solid button-sm" href="/sign-up">Sign Up For Free</a>
				<span class="text-0.85em opacity-90">No credit card required. No ads, no trackers.</span>
			{:else}
				<!-- Invitation-only (the signUpMode app setting): the waitlist is the way in. -->
				<a class="button-accent-solid button-sm" href="/waitlist">Join the Waitlist</a>
				<div class="text-0.85em">
					<span class="opacity-90">Already have an invite code?</span>
					<a
						class="inline-block ml-2 underline underline-offset-3 opacity-90 hover-opacity-100 hover-text-accent"
						href="/sign-up">Sign Up</a
					>
				</div>
			{/if}
			{#if copy.canEdit}
				<a class="button button-xs" href={copy.editHref} title="Edit this page's words">
					<span class="i-ph-pencil-simple" aria-hidden="true"></span>
					Edit
				</a>
			{/if}
		</div>
		<!-- {#if !data.user}
			<div class="mt-6">
				<p class="mb-2 text-15px opacity-90">
					No invite yet? Join the beta waitlist and we will send you a code as seats open.
				</p>
				<WaitlistForm compact />
			</div>
		{/if} -->
	</div>

	<div class="grid grid-cols-1 gap-x-8 gap-y-1 xl-gap-16 2xl-gap-16 place-content-start">
		<!-- features -->
		<section class="">
			{#if data.demo}
				<h2 class="marketing-section-heading sr-only">Features</h2>

				<!-- Song Demo: A live song, chosen on /admin/home: the player as visitors get it. -->
				<section>
					{@render feature("player")}
					<div class="marketing-demo-cta">Try the working demo below.</div>
					<!-- Full bleed on a phone (the page padding is px-4 there), a card from sm up. -->
					<div
						class="marketing-demo-container mt-8"
						{@attach visibleShare((s) => (playerShare = s))}
					>
						<SongPlayerDemo
							view={data.demo}
							href={data.demo.href}
							bind:comments={demoComments}
							keyboard={spaceTarget === "player"}
						/>
					</div>
				</section>

				<!-- Idea Recorder Demo: The real recorder in its phone layout, nothing uploaded (IdeaRecorderDemo). -->
				<section class="mt-12 scroll-mt-6" id="idea-recorder">
					{@render feature("recorder")}
					<!-- The real recorder in its phone layout, nothing uploaded (IdeaRecorderDemo). -->
					<div class="marketing-demo-cta">Try the working demo below.</div>
					<div class=" mt-8">
						<IdeaRecorderDemo
							signedIn={!!data.user}
							recorderHref={data.currentSlug ? "/ideas/recorder" : null}
						/>
					</div>
				</section>
			{:else}
				<img
					class="w-full h-auto border border-white/40 rounded mt-4 shadow-xl shadow-blue-300/10"
					loading="eager"
					src="/images/stem-shovel-screenshot-01.webp"
					alt="Stem Shovel screenshot"
				/>
			{/if}
		</section>

		<!-- Documents Demo  -->
		<div class="grid grid-cols-1 gap-y-12 lg-grid-cols-2 gap-x-12">
			<section class="mt-12">
				{@render feature("docs")}
				<div class="marketing-demo-cta">Try the working demo below.</div>
				<div class="mt-8">
					{#if data.demo}
						<SongDocsDemo
							view={data.demo}
							href={data.demo.href}
							comments={demoComments}
							onremove={(id) => (demoComments = demoComments.filter((c) => c.id !== id))}
						/>
					{:else}
						<p class="text-dim">No demo song is chosen yet.</p>
					{/if}
				</div>
			</section>

			<section class="mt-12">
				{@render feature("tools")}
				<div class="marketing-demo-cta">Try the working demo below.</div>
				<!-- One demo at a time: the tabs swap the tuner for the metronome. The tuner's microphone opens only from its On / Off button: opening it on scroll asked for permission again and again as the page went up and down. -->
				<div
					class="mt-8 flex gap-1 rounded bg-dark/40 p-1 w-fit"
					role="tablist"
					aria-label="Tool demo"
				>
					{#each TOOLS as t (t.id)}
						<button
							type="button"
							role="tab"
							aria-selected={tool === t.id}
							class="rounded px-3 py-1.5 text-sm text-nowrap {tool === t.id
								? 'bg-accent font-500 text-oxford'
								: 'hover-bg-dark/60'}"
							onclick={() => (tool = t.id)}>{t.name}</button
						>
					{/each}
				</div>
				<div class="mt-4">
					{#if tool === "tuner"}
						<Tuner />
					{:else}
						<Metronome />
					{/if}
				</div>
			</section>
		</div>

		<!-- Drum Machine Demo -->
		<section class="mt-12">
			{@render feature("drums")}
			<div class="flex flex-wrap items-center gap-x-5">
				<div class="marketing-demo-cta">Try the working demo below.</div>
				<a class="link inline-flex items-center gap-1.5 text-14px" href="/drum-machine"
					>Free standalone version <span class="i-ph-arrow-right" aria-hidden="true"></span></a
				>
			</div>
			<!-- Space plays and stops only while this is the demo in view (see spaceTarget): elsewhere the page needs space for scrolling. -->
			<!-- The kit's samples are fetched as the demo scrolls into view, not at load: a visitor who never gets here downloads nothing. -->
			<div
				class="mt-8"
				{@attach visibleShare((s) => {
					drumsShare = s;
					if (s > 0) drumMachine.warmKit();
				})}
			>
				<DrumMachine
					kits={data.kits}
					keyboard={spaceTarget === "drums"}
					starting={data.homeBeat}
					homeAdmin={!!data.user?.isSystemAdmin}
					textToBeat={data.textToBeat}
				/>
			</div>
		</section>

		<!-- Piano Demo -->
		<section class="mt-12">
			{@render feature("piano")}
			<div class="flex flex-wrap items-center gap-x-5">
				<div class="marketing-demo-cta">Try the working demo below.</div>
				<a class="link inline-flex items-center gap-1.5 text-14px" href="/piano"
					>Free standalone version <span class="i-ph-arrow-right" aria-hidden="true"></span></a
				>
			</div>
			<!-- The computer keyboard plays only while this is the demo in view (see spaceTarget). -->
			<!-- The Grand Piano's demo samples (3.4 MB) are fetched as the demo scrolls into view, so the first touch finds them in. -->
			<div
				class="mt-8"
				{@attach visibleShare((s) => {
					pianoShare = s;
					if (s > 0) piano.prefetch();
				})}
			>
				<Piano keyboard={spaceTarget === "piano"} sitePresets={data.pianoPresets} />
			</div>
		</section>

		<!-- Chord Player Demo -->
		<section class="mt-12">
			{@render feature("chords")}
			<div class="flex flex-wrap items-center gap-x-5">
				<div class="marketing-demo-cta">Try the working demo below.</div>
				<a class="link inline-flex items-center gap-1.5 text-14px" href="/chord-player"
					>Free standalone version <span class="i-ph-arrow-right" aria-hidden="true"></span></a
				>
			</div>
			<!-- The computer keyboard plays only while this is the demo in view (see spaceTarget). The chord player has its own engine, so its sound is its own; the samples are cached per module, so the piano demo's prefetch serves it too. -->
			<div
				class="mt-8"
				{@attach visibleShare((s) => {
					chordsShare = s;
					if (s > 0) chordPiano.prefetch();
				})}
			>
				<ChordPlayer
					keyboard={spaceTarget === "chords"}
					sitePresets={data.chordPresets}
					pad={false}
				/>
			</div>
		</section>

		<!-- faqs -->
		<section class="mt-12">
			<h2 class="marketing-section-heading">{section("faq").heading}</h2>
			<div
				class="
					grid
					grid-cols-1
					gap-4
					place-content-start
					[&>div]-(marketing-box)
					[&_h3]-(marketing-faq-heading)
					[&_p]-(marketing-faq-text)
					[&_a]-(link)
					lg-grid-cols-2
					xl-grid-cols-3"
			>
				{#each faqs as faq (faq.id)}
					<div>
						<h3>{faq.heading}</h3>
						{#each faq.paragraphs as html, i (i)}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown rendered server-side from the copy doc (never user text) -->
							<p>{@html html}</p>
						{/each}
					</div>
				{/each}
			</div>
		</section>
	</div>

	<!-- {#if !data.user}
		<p class="mt-6 max-w-prose text-15px text-dim">
			Anyone with a link can listen. Signing in lets you upload and edit.
		</p>
	{/if} -->
</main>
