<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import SongDocsDemo from "$lib/components/SongDocsDemo.svelte";
	import SongPlayerDemo from "$lib/components/SongPlayerDemo.svelte";
	import IdeaRecorderDemo from "$lib/components/IdeaRecorderDemo.svelte";
	import WaitlistForm from "$lib/components/WaitlistForm.svelte";
	import { exampleComments } from "$lib/constants/demoComments";
	import Tuner from "$lib/components/Tuner.svelte";
	import DrumMachine from "$lib/components/DrumMachine.svelte";

	let { data } = $props();
	// The demos' comments: examples plus whatever the visitor adds, kept in this page only.
	let demoComments = $state(exampleComments());

	const description =
		"A collaboration tool for musicians, bands and producers: store and share demos, stems, lyrics and chord charts, with an emphasis on creativity, simplicity and affordability.";

	const faqs = $derived([
		{
			question: "What is Stem Shovel?",
			answer: `Stem Shovel is a web app for managing songwriting, arranging, and recording projects with an emphasis on creativity and collaboration. Built by musicians for musicians, this	web-app is intended to be an easy-to-use and affordable location for storing and sharing demos, stems, lyrics, chord charts and other songwriting assets. Without clutter, up-sells or feature bloat.`,
		},
		{
			question: "How do I get started?",
			answer: data.signUpOpen
				? `<a class="link" href="/sign-up">Sign up for free</a>: choose the Free plan, enter your name, email and a password, and open the verification link we send. No invitation, no payment and no credit card are needed.`
				: `Stem Shovel is in early beta and you will need an invite or invite code to join and use it. If you are eager to try it out, <a class="underline underline-offset-4 hover-text-accent" href="/waitlist">join the waitlist</a> and we will send you a code as seats open. You will not be required to provide any payment or credit card info to sign up.`,
		},
		{
			question: "How much does it cost?",
			answer: `Our basic tier is a free account. That offers full access to all available features with free data storage up to 10GB. Free accounts require no payment or credit card info to sign up and remain free for life. During the beta period only free accounts are available. Beyond that, we will continue to support and focus on free accounts for independent bands, musicians, producers and educators, and will introduce paid plans for those who need more storage or more advanced features.`,
		},
		{
			question: "Is this a desktop app?",
			answer: `Nope. It's a web app. Built with mostly open source technologies and hosted on a cloud platform. It works cross browser and cross platform and is accessible from any device with a web browser and internet connection. We have no plans to build a desktop app in the near future, a web app fits our needs, and is easy to support.`,
		},
		{
			question: "Who is the dev team behind Stem Shovel?",
			answer: `The first iteration of Stem Shovel was built by Kevin Peckham at Lightning Jar as part of our side-projects program, where team members are encouraged to spend time pursuing passion projects, research, and pay with new technologies. Lightning Jar is a small web studio founded in 2002, with the goal of helping organizations adjust to a world that is more digital every day.`,
		},
		{
			question: "Is the free tier really free?",
			answer: `Emphatically yes. We are not a startup, this is not our primary revenue stream, and we do not plan on taking on any investors. Which is to say all we need to do is cover our expenses, and those primarily have to do with servers, security, data storage, and support.`,
		},
		{
			question: "Does this project have AI Features?",
			answer: `Some of the product features like advanced chord detection are powered by AI. However we are sensitive to the fact that some artists do not want to use AI features and require that their original music never touch 3rd party LLM models. For that reason all LLM-powered features can be easily turned off with a single click either at the project or song level.`,
		},
		{
			question: "Was this app vibe-coded?",
			answer: `While we do use AI as part of our process to speed up development, this app	was not vibe-coded. Our team has been building websites and web apps for over 25 years and	we have a deep understanding of what it takes to build a high-quality product, with human-driven architecture and design decisions following an approach to app building that mirrors our own experience and expertise.`,
		},
		{
			question: "Is the app open source?",
			answer: `Yes. You can find our source code on Github at <a class="underline underline-offset-4 hover-text-accent"
		href="https://github.com/kevinpeckham/stem-shovel">https://github.com/stem-shovel/stem-shovel</a>. You're welcome to clone the project and set up your own private version on your own servers. We don't have a team in place to handle 3rd party pull requests, so we don't accept them. However you can submit feature suggestions vial a link in the footer, though
	you must be logged-in to do so.`,
		},
	]);
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

<main class="home-page-x-padding pt-4 pb-16 min-h-full">
	<div class="border-b border-b-current/10 pt-6 pb-2 mb-8">
		<!-- <h1 class="heading-2 mb-2">Introducing Stem Shovel</h1> -->
		<h1 class="block marketing-headline">
			Stem Shovel is a web-based collaboration tool for musicians, bands and producers with emphasis
			on creativity, simplicity, and affordability.
		</h1>
		<div class="mt-8 flex flex-wrap gap-4 items-baseline">
			{#if data.user}
				<!-- {#each data.memberships as m (m.accountId)}
					<a class="button-accent" href="/{m.slug}/projects">{m.name} →</a>
				{/each} -->
			{:else if data.signUpOpen}
				<a class="button-accent-solid button-sm" href="/sign-up">Sign Up For Free</a>
				<span class="text-0.85em opacity-90">No credit card required.</span>
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
					<h3 class="marketing-section-heading">Stem Player & Mix Comments</h3>
					<h4 class="marketing-topic-heading">Share Stems, Leave Feedback</h4>
					<p class="marketing-paragraph text-balance">
						Mute, solo and download stems or leave comments on the timeline for your collaborators.
					</p>
					<div class="marketing-demo-cta">Try the working demo below.</div>
					<!-- Full bleed on a phone (the page padding is px-4 there), a card from sm up. -->
					<div class="marketing-demo-container mt-8">
						<SongPlayerDemo view={data.demo} href={data.demo.href} bind:comments={demoComments} />
					</div>
				</section>

				<!-- Idea Recorder Demo: The real recorder in its phone layout, nothing uploaded (IdeaRecorderDemo). -->
				<section class="mt-12 scroll-mt-6" id="idea-recorder">
					<h3 class="marketing-section-heading">Audio Recorder</h3>
					<div class="marketing-topic-heading">High Fidelity Idea Recorder</div>
					<p class="marketing-paragraph text-balance">
						Record your song ideas and demos and save them with integrated notes specific to each
						idea. Supports multiple takes. Record lossless audio and easily export MP3s or source
						files.
					</p>
					<!-- The real recorder in its phone layout, nothing uploaded (IdeaRecorderDemo). -->
					<div class="marketing-demo-cta">Try the working demo below.</div>
					<div class=" mt-8">
						<IdeaRecorderDemo
							signedIn={!!data.user}
							recorderHref={data.currentSlug ? `/${data.currentSlug}/ideas/recorder` : null}
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
				<h3 class="marketing-section-heading">Song Notes, Charts and Comments</h3>
				<div class="marketing-topic-heading">Charts, Lyrics, Notes and Comments</div>
				<p class="marketing-paragraph text-balance">
					Easily edit and share lyrics, notes, charts and more in a wiki-style editor. Keep
					everything organized and easy to access for all members of the project.
				</p>
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
				<h3 class="marketing-section-heading">Guitar Tuner Demo</h3>
				<div class="marketing-topic-heading">Songwriting Tools & Utilities</div>
				<p class="marketing-paragraph text-balance">
					The tools you need to be creative and productive as a songwriter all in one place. Like
					this guitar tuner, which is also available as a pop-over from the idea-recorder, so you
					can tune your guitar between takes or in the middle of a writing session.
				</p>
				<div class="marketing-demo-cta">Try the working demo below.</div>
				<!-- Not startOnHover: on the home page the microphone opens only from the On / Off button. -->
				<div class="mt-8">
					<Tuner />
				</div>
			</section>
		</div>

		<!-- Drum Machine Demo -->
		<section class="mt-12">
			<h3 class="marketing-section-heading">Drum Machine Demo</h3>
			<div class="marketing-topic-heading">Drum Machine &amp; Sequencer</div>
			<p class="marketing-paragraph text-balance">
				Experiment with beat ideas, in an intuitive interface. Save, download &amp; share. Or use as
				a backing track while recording an idea or demo.
			</p>
			<div class="marketing-demo-cta">Try the working demo below.</div>
			<!-- No space-bar shortcut here: the home page needs space for scrolling. -->
			<div class="mt-8 max-w-860px">
				<DrumMachine keyboard={false} />
			</div>
		</section>

		<!-- faqs -->
		<section class="mt-12">
			<h2 class="marketing-section-heading">Frequently Asked Questions</h2>
			<div
				class="
					grid
					grid-cols-1
					gap-4
					place-content-start
					[&>div]-(marketing-box)
					[&_h3]-(marketing-faq-heading)
					[&_p]-(marketing-faq-text)
					lg-grid-cols-2
					xl-grid-cols-3"
			>
				{#each faqs as faq}
					<div>
						<h3>{faq.question}</h3>
						<p>{@html faq.answer}</p>
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
