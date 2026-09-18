<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import SongDocsDemo from "$lib/components/SongDocsDemo.svelte";
	import SongPlayerDemo from "$lib/components/SongPlayerDemo.svelte";
	import WaitlistForm from "$lib/components/WaitlistForm.svelte";
	import { exampleComments } from "$lib/constants/demoComments";

	let { data } = $props();
	// The demos' comments: examples plus whatever the visitor adds, kept in this page only.
	let demoComments = $state(exampleComments());

	const description =
		"A collaboration tool for musicians, bands and producers: store and share demos, stems, lyrics and chord charts, with an emphasis on creativity, simplicity and affordability.";
</script>

<svelte:head>
	<title
		>{pageTitle("Stem Shovel - Collaboration tool for musicians, bands and producers", true)}</title
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

<main class="page-x-padding pt-4 pb-16 min-h-full">
	<div class="border-b border-b-current/10 pb-5 mb-8">
		<!-- <h1 class="heading-2 mb-2">Introducing Stem Shovel</h1> -->
		<h1 class="max-w-prose mb-4 text-balance">
			Stem Shovel is a web-based collaboration tool for musicians, bands and producers with emphasis
			on creativity, simplicity, and affordability.
		</h1>
		<div class="mt-4 flex flex-wrap gap-3">
			{#if data.user}
				<!-- {#each data.memberships as m (m.accountId)}
					<a class="button-accent" href="/{m.slug}/projects">{m.name} →</a>
				{/each} -->
			{:else}
				<a class="button-accent button-sm" href="/sign-in">Sign in</a>
				<a class="button button-sm" href="/sign-up">Register</a>
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

	<div
		class="grid grid-cols-1 gap-x-8 gap-y-1 xl-grid-cols-2 xl-gap-20 2xl-gap-24 place-content-start"
	>
		<!-- stem player demo -->
		<div class="">
			{#if data.demo}
				<h2 class="text-accent mb-5">Features</h2>
				<!-- A live song, chosen on /admin/home: the player as visitors get it. -->
				<section class="">
					<h3 class="text-18px font-600 leading-tight mb-2">Share Stems, Leave Feedback</h3>
					<p class="opacity-90 text-16px max-w-740px mb-3 text-balance">
						Mute, solo and download stems or leave comments on the timeline for your collaborators.
						Try it out in the working demo below.
					</p>
					<!-- Full bleed on a phone (the page padding is px-4 there), a card from sm up. -->
					<div
						class="bg-black/30 -mx-4 px-4 pt-4 pb-5 border-y border-current/5 mt-6 shadow sm:mx-0 sm:px-5 sm:rounded-lg sm:border"
					>
						<SongPlayerDemo view={data.demo} href={data.demo.href} bind:comments={demoComments} />
					</div>
				</section>

				<section class="mt-12">
					<h3 class="text-18px font-600 leading-tight mb-2">Charts, Lyrics, Notes and Comments</h3>
					<p class="opacity-90 text-16px max-w-740px mb-5 text-balance">
						Easily edit and share lyrics, notes, charts and more. The demo below shows documentation
						for the song above.
					</p>
					<div
						class="bg-black/30 -mx-4 px-4 pt-4 pb-5 border-y border-current/5 mt-6 shadow min-h-600px sm:mx-0 sm:px-5 sm:rounded-lg sm:border"
					>
						<SongDocsDemo
							view={data.demo}
							href={data.demo.href}
							comments={demoComments}
							onremove={(id) => (demoComments = demoComments.filter((c) => c.id !== id))}
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
		</div>

		<section>
			<h2 class="text-accent mb-2">Frequently Asked Questions</h2>

			<div
				class="text-17px max-w-740px grid grid-cols-1 gap-0 [&>p]-mb-3 [&>p]-opacity-90 [&>h2]-mb-2 [&>h2]-mt-5 place-content-start [&>h3]-(mt-5 mb-2 leading-tight font-600 text-18px) [&>p]-(mb-3)"
			>
				<h3>What is Stem Shovel?</h3>
				<p class="">
					Stem Shovel is a web app for managing songwriting, arranging, and recording projects with
					an emphasis on creativity and collaboration. Built by musicians for musicians, this
					web-app is intended to be an easy-to-use and affordable location for storing and sharing
					demos, stems, lyrics, chord charts and other songwriting assets. Without clutter,
					up-sells, or feature bloat.
				</p>
				<h3>How do I get started?</h3>
				<p>
					Stem Shovel is in early beta and you will need an invite or invite code to join and use
					it. If you are eager to try it out, <a
						class="underline underline-offset-2"
						href="/waitlist">join the waitlist</a
					> and we will send you a code as seats open.
				</p>

				<h3>How much does it cost?</h3>
				<p>
					During the early beta period all subscriptions are free. Beyond that, our plan is to offer
					a generous free tier for independent bands, musicians, producers and educators, with no
					recurring subscription and free data storage up to 10 GB.
				</p>

				<h3>Is this a desktop app?</h3>
				<p>
					Nope. It's a web app. Built with mostly open source technologies and hosted on a cloud
					platform. It works cross browser and cross platform and is accessible from any device with
					a web browser and internet connection.
				</p>

				<h3>Who is the dev team behind Stem Shovel?</h3>
				<p>
					Stem Shovel 0.0.1 was built by Kevin Peckham at Lightning Jar as part of our side-projects
					program. Lightning Jar is a small web studio founded in 2002, with the goal of helping
					organizations adjust to a world that is more digital every day.
				</p>
				<h3>Are you going to lure us in with a generous free tier then increase prices later?</h3>
				<p>
					Emphatically no. Stem Shovel is built, managed, and maintained by Lightning Jar and select
					volunteers and we are not a startup, this is not our primary revenue stream and we do not
					plan on taking on any investors. Which is to say we're not here to get rich and we feel no
					pressure to grow. All we need to do is cover our expenses, and those primarily have to do
					with servers, security, data storage, and support.
				</p>
				<h3>Does this project have AI Features?</h3>
				<p>
					Some of the product features like advanced chord detection are powered by AI. However we
					are sensitive to the fact that some artists do not want to use AI features and require
					that their original music never touch 3rd party LLM models. For that reason all
					LLM-powered features can be easily turned off with a single click either at the project or
					song level.
				</p>
				<h3>Was this app vibe-coded?</h3>
				<p>
					If you're not familiar with the term, vibe coding means building something entirely from
					AI prompts. While we do use AI as part of our process to speed up development, this app
					was not vibe-coded. Our team has been building websites and web apps for over 25 years and
					we have a deep understanding of what it takes to build a high-quality product, with
					human-driven architecture and design decisions following an approach to app building that
					mirrors our own experience and expertise.
				</p>
				<h3>Is the app open source?</h3>
				<p>
					Yes. You can find our source code on Github at <a
						class="underline underline-offset-4 hover-text-accent"
						href="https://github.com/kevinpeckham/stem-shovel"
						>https://github.com/stem-shovel/stem-shovel</a
					>. You're welcome to clone the project and set up your own private version on your own
					servers. We don't have a team in place to handle 3rd party pull requests, so we don't
					accept them. However you can submit feature suggestions vial a link in the footer, though
					you must be logged-in to do so.
				</p>
			</div>
		</section>
	</div>

	<!-- {#if !data.user}
		<p class="mt-6 max-w-prose text-15px text-dim">
			Anyone with a link can listen. Signing in lets you upload and edit.
		</p>
	{/if} -->
</main>
