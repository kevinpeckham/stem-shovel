<script lang="ts">
	// in dev mode this component helps show where container query breakpoints are
	import { dev } from "$app/env";

	// put classes here for unoCSS scanner to find
	const _safelist = `
		@xs-block @xs-hidden
		@md-block @md-hidden
		@sm-block @sm-hidden
		@lg-block @lg-hidden
		@xl-block @xl-hidden
		@2xl-block @2xl-hidden
		@3xl-block @3xl-hidden
		@4xl-block @4xl-hidden
		@5xl-block @5xl-hidden
		@6xl-block @6xl-hidden
		@7xl-block @7xl-hidden
		@8xl-block @8xl-hidden
		`;

	const _bps = [
		{ name: "xs", bp: 320 },
		{ name: "sm", bp: 384 },
		{ name: "md", bp: 448 },
		{ name: "lg", bp: 512 },
		{ name: "xl", bp: 576 },
		{ name: "2xl", bp: 672 },
		{ name: "3xl", bp: 768 },
		{ name: "4xl", bp: 896 },
		{ name: "5xl", bp: 1024 },
		{ name: "6xl", bp: 1152 },
		{ name: "7xl", bp: 1280 },
		{ name: "8xl", bp: 1536 },
	];
</script>

{#if dev}
	<div class="absolute top-4 right-4 text-red border rounded-md px-2 py-1 leading-none text-0.9em">
		{#each _bps as size, index}
			{@const nextIndex = index + 1 > _bps.length - 1 ? -1 : index + 1}
			{@const nextSize = nextIndex >= 0 ? _bps[nextIndex] : ""}
			{@const nextSizeClass = nextSize ? `@${nextSize.name}-hidden` : ""}
			<div class="hidden @{size.name}-block {nextSizeClass}">
				{size.name}
				{">"}
				{size.bp.toString()}px
			</div>
		{/each}
	</div>
{/if}
