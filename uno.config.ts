import extractorSvelte from "@unocss/extractor-svelte";
import presetWind4 from "@unocss/preset-wind4";
import {
	defineConfig,
	presetIcons,
	presetWebFonts,
	transformerDirectives,
	transformerVariantGroup,
} from "unocss";

/**
 * Mirrors lightningjar.com's uno.config (lightning-jar/lj-website) so the
 * app shares its look: wind4 + reset, Atkinson Hyperlegible / Bungee Shade
 *  * from bunny, the same palette and shortcuts. On top of that, the
 * app's semantic colour tokens; the waveform canvas reads its colour from the
 * element (a `text-*` utility), so nothing imports the palette.
 */
export default defineConfig({
	extractors: [extractorSvelte()],
	preflights: [],
	presets: [
		presetWind4({ preflights: { reset: true } }),
		// Phosphor icons as classes (`i-ph-play-fill`), as in replicator
		presetIcons({
			warn: true,
		}),
		presetWebFonts({
			provider: "bunny",
			fonts: {
				brand: "Bangers",
				// display: "Bahiana",
				sans: { name: "Atkinson Hyperlegible", weights: ["400", "700"] },
			},
		}),
	],
	theme: {
		colors: {
			accent: "#ebf92f",
			oxford: {
				50: "oklch(0.95 0.048 259.91)",
				100: "oklch(0.9 0.048 259.91)",
				200: "oklch(0.8 0.048 259.91)",
				300: "oklch(0.7 0.048 259.91)",
				400: "oklch(0.6 0.048 259.91)",
				500: "oklch(0.5 0.048 259.91)",
				600: "oklch(0.4 0.048 259.91)",
				700: "oklch(0.3 0.048 259.91)",
				800: "oklch(0.2 0.048 259.91)",
				900: "oklch(0.1 0.048 259.91)",
				950: "oklch(0.05 0.048 259.91)",
				DEFAULT: "oklch(0.252 0.048 259.91)",
			},
			maximumYellow: {
				50: "oklch(0.95 0.201 113.9)",
				100: "oklch(0.9 0.201 113.9)",
				200: "oklch(0.8 0.201 113.9)",
				300: "oklch(0.7 0.201 113.9)",
				400: "oklch(0.6 0.201 113.9)",
				500: "oklch(0.5 0.201 113.9)",
				600: "oklch(0.4 0.201 113.9)",
				700: "oklch(0.3 0.201 113.9)",
				800: "oklch(0.2 0.201 113.9)",
				900: "oklch(0.1 0.201 113.9)",
				950: "oklch(0.05 0.201 113.9)",
				DEFAULT: "oklch(0.9406 0.201 113.9)",
			},
			cultured: {
				50: "oklch(0.95 0 0)",
				100: "oklch(0.9 0 0)",
				200: "oklch(0.8 0 0)",
				300: "oklch(0.7 0 0)",
				400: "oklch(0.6 0 0)",
				500: "oklch(0.5 0 0)",
				600: "oklch(0.4 0 0)",
				700: "oklch(0.3 0 0)",
				800: "oklch(0.2 0 0)",
				900: "oklch(0.1 0 0)",
				950: "oklch(0.05 0 0)",
				DEFAULT: "oklch(0.9431 0 0)",
			},
			offWhite: "oklch(0.9904 0.002 286.4)",
			// ---
			// panel: "oklch(0.252 0.048 259.91)", // page background
			row: "rgba(255, 255, 255, 0.05)", // stem row / card surface on the oxford ground
			ink: "#f5f5f5", // primary text (neutral-100); active mute button
			// dim: "#cbd5e1", // secondary text (slate-300)
			line: "rgba(255, 255, 255, 0.12)", // hairline borders,
		},
	},
	// Everything src/app.html uses: it is outside the Svelte pipeline, so the
	// classes are also safelisted (filesystem scanning alone is not enough in
	// every mode).
	safelist: [
		"font-sans",
		"bg-oxford",
		"bg-gradient-to-br",
		"from-oxfordDark",
		"to-oxford",
		"text-neutral-100",
		"max-w-screen",
		"overflow-x-hidden",
		"scroll-smooth",
		"grid",
		"grid-cols-1",
		"grid-rows-[auto_1fr_auto]",
		"min-h-screen",
		"w-full",
	],
	shortcuts: [
		// ---- lj-website -------------------------------------------------------
		[
			"button",
			`
				border
				border-current
				flex
				gap-2
				items-center
				max-w-fit
				opacity-90
				px-3
				py-1.5
				rounded
				text-[0.9em]
				disabled-opacity-40
				disabled-pointer-events-none
				hover-text-oxford
				hover-bg-accent
				hover-opacity-100

			`,
		],
		["button-sm", "text-14px py-1"],
		["button-xs", "text-12px py-1"],
		["button-accent", "button text-accent hover-text-oxford"],
		["page-x-padding", "px-4 sm:px-6 md:px-7 lg:px-8 xl:px-16 2xl:px-24"],
		["main-y-padding", "pt-10 pb-14 lg:(pt-12 pb-16) xl:(pt-14 pb-20) 2xl:(pt-16 pb-22)"],
		[
			"max-w-article",
			"max-w-none sm:max-w-[34rem] md:max-w-[36rem] lg:max-w-[38rem] xl:max-w-[40rem] 2xl:max-w-[45rem]",
		],
		["heading-1", "text-balance font-700 text-accent mb-3 text-32px lg:text-32px leading-snug"],
		["heading-2", "font-700 text-white mb-3 text-20px lg:text-22px"],
		["heading-3", "font-500 text-white mb-3 text-18px lg:text-18px"],
		["nav-link", "underline underline-offset-4 hover:text-maximumYellow opacity-90"],
		[
			"list-tile",
			"bg-blue-300/5 rounded-md border border-current/40 block px-4 py-3 text-18px hover-text-accent hover-border-accent hover-bg-accent/5 lg-text-20px leading-tight",
		],

		// ---- app ---------------------------------------------------------------
		["page", "page-x-padding main-y-padding grid grid-cols-1 gap-8 place-content-start"],
		["link-dim", "underline underline-offset-4 hover:text-maximumYellow"],
		["surface", "rounded border border-white/10 bg-row"],
		["tile", "border border-white/10 rounded p-6"],
		[
			"field",
			"block w-full rounded border border-white/15 bg-black/20 px-3 py-2 text-neutral-100 placeholder:text-slate-400 focus:(border-maximumYellow outline-none)",
		],
		["tab", "px-3 py-1 text-xs"],
		["tab-active", "tab bg-accent text-oxford"],
		["tab-idle", "tab hover-current/80"],

		// Chart / lyrics typography, shared by the read-only <article> and the
		// woof-editor surface (its own body styles are zero-specificity, so these
		// win). Written like replicator's `article-body`: direct-child selectors
		// plus sibling rules for vertical rhythm. Chord grids live in code blocks.
		[
			"chart-body",
			[
				"text-15px leading-relaxed",
				// headings
				"[&>h1]:(text-22px font-700 text-maximumYellow)",
				"[&>h2]:(text-18px font-700 text-maximumYellow)",
				"[&>h3]:(text-16px font-700)",
				"[&>h4]:(text-15px font-700 italic)",
				"[&>*_+h2]:mt-6",
				"[&>*_+h3,&>*_+h4]:mt-5",
				"[&>h1_+*,&>h2_+*,&>h3_+*,&>h4_+*]:mt-2",
				// paragraphs keep their line breaks: lyric lines
				"[&>p]:(whitespace-pre-wrap opacity-90)",
				"[&>p_+p,&>p_+ul,&>p_+ol,&>p_+pre,&>p_+blockquote]:mt-3",
				// lists
				"[&>ul]:(list-disc pl-5)",
				"[&>ol]:(list-decimal pl-5)",
				"[&>ul,&>ol]:(grid grid-cols-1 gap-1 opacity-90)",
				"[&>ul_+*,&>ol_+*]:mt-3",
				// quotes
				"[&>blockquote]:(pl-3 border-l-3 border-maximumYellow/60)",
				"[&>blockquote_+*]:mt-3",
				// code: chord grids
				"[&>pre]:(px-3.5 py-3 rounded-md bg-black/30 overflow-x-auto text-14px leading-normal)",
				"[&>pre_+*]:mt-4",
				"[&_code]:font-mono",
				"[&_:not(pre)>code]:(px-1.5 py-0.5 rounded bg-black/30)",
				// misc
				"[&>hr]:(border-0 border-t border-white/15 my-5)",
				"[&_a]:(underline underline-offset-3 text-maximumYellow)",
				"[&>table]:(border-collapse mt-3)",
				"[&_th,&_td]:(border border-white/15 px-2 py-1)",
				"[&_section.footnotes]:(mt-6 pt-3 border-t border-white/15 text-13px)",
			].join(" "),
		],
		[
			"chart-editor",
			[
				"[--woof-accent:#ebf92f]",
				"[--woof-accent-soft:#f5fb8f]",
				"[--woof-menu-bg:hsl(217,48%,12%)]",
				"[--woof-menu-fg:#f5f5f5]",
				"[--woof-menu-hover:#21355b]",
				"[--woof-gutter-bg:#21355b]",
				"[--woof-gutter-fg:#f5f5f5]",
				"[--woof-input-bg:hsl(217,48%,10%)]",
				"[--woof-popover-bg:#21355b]",
				"[--woof-popover-fg:#f5f5f5]",
				"[--woof-popover-border:rgba(255,255,255,0.2)]",
				"[&_.woof-editor-body]:(min-h-64 outline-none)",
			].join(" "),
		],
	],
	transformers: [transformerDirectives(), transformerVariantGroup()],
});
