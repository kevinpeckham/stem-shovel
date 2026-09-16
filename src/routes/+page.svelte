<script lang="ts">
	let { data } = $props();

	const description =
		"A collaboration tool for musicians, bands and producers: store and share demos, stems, lyrics and chord charts, with an emphasis on creativity, simplicity and affordability.";
</script>

<svelte:head>
	<title>Stem Shovel — a collaboration tool for musicians, bands and producers</title>
	<meta name="description" content={description} />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href="https://www.stem-shovel.com/" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Stem Shovel" />
	<meta property="og:title" content="Stem Shovel" />
	<meta property="og:description" content={description} />
	<meta property="og:url" content="https://www.stem-shovel.com/" />
	<meta
		property="og:image"
		content="https://www.stem-shovel.com/images/stem-shovel-screenshot-01.webp"
	/>
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main class="page-x-padding main-y-padding">
	<h1 class="heading-2 mb-4">What is Stem Shovel?</h1>
	<div class="grid grid-cols-1 gap-8 xl-grid-cols-2">
		<div class="text-17px max-w-740px grid grid-cols-1 gap-0 [&>p]-mb-3 [&>p]-opacity-90 [&>h2]-mb-2 [&>h2]-mt-5">
			<blockquote class="max-w-prose mb-8 text-balance">
				Stem Shovel is a SaaS collaboration tool for musicians, bands and producers with emphasis on creativity,
				simplicity, and affordability.
			</blockquote>

			<h2 class="heading-2">Mission</h2>
			<p class="">
				Stem Shovel was conceived as a place to manage songwriting, arranging, and recording
				projects with an emphasis on creativity and collaboration. Built by musicians for musicians,
				this web-app is intended to be an easy-to-use and affordable location for storing and
				sharing demos, stems, lyrics, chord charts and other songwriting assets. Without clutter,
				up-sells, or feature bloat.
			</p>
			<h2 class="heading-2 leading-tight mb-0">How do I get started?</h2>
			<p>
				Stem Shovel is in early beta and you will need an invite to join and use it. Our plan is to
				offer a generous free tier for independent bands, musicians, producers and educators, with
				no recurring subscription and free data storage up to 10 GB.
			</p>

			<h2 class="heading-2 leading-tight mb-0">Is this a desktop app?</h2>
			<p>
				Nope. It's a web app. Built with mostly open source technologies and hosted on a cloud
				platform. It works cross browser and cross platform and is accessible from any device with a
				web browser and internet connection.
			</p>

			<h2 class="heading-2 leading-tight mb-0">Who is behind Stem Shovel and What's Your Plan?</h2>
			<p>
				Stem Shovel 0.0.1 was built by Kevin Peckham at Lightning Jar as part of our side-projects
				program. Lightning Jar is a small web studio founded in 2002, with the goal of helping
				organizations adjust to a world that is more digital every day. Stem Shovel is 100% owned
				and maintained by Lightning Jar and we don't plan on taking on any investors. We're Ok with
				growing slowly and we're not out to change the world. We want to keep this tool simple,
				useful, and sustainable and if it pays its own bills one day we're happy.
			</p>
		</div>

		<div class="">
			<img
				class="w-full h-auto border border-white/40 rounded mt-4 shadow-xl shadow-blue-300/10"
				loading="eager"
				src="/images/stem-shovel-screenshot-01.webp"
				alt="Stem Shovel screenshot"
			/>
		</div>
	</div>

	<div class="mt-8 flex flex-wrap gap-3">
		{#if data.user}
			{#each data.memberships as m (m.accountId)}
				<a class="button-accent" href="/{m.slug}/projects">{m.name} →</a>
			{/each}
		{:else}
			<a class="button-accent" href="/sign-in">Sign in</a>
			<a class="button" href="/sign-up">Register</a>
		{/if}
		<!-- <a class="button" href="/test">Static test page</a> -->
	</div>
	<!-- {#if !data.user}
		<p class="mt-6 max-w-prose text-15px text-dim">
			Anyone with a link can listen. Signing in lets you upload and edit.
		</p>
	{/if} -->
</main>
