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
 * Turn a utility value into a CSS dashed-ident.
 * anchor-name only accepts dashed idents like `--tooltip`,
 * so we add the `--` prefix when it's missing.
 */
const toDashedIdent = (value: string): string =>
  value.startsWith('--') ? value : `--${value}`

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
		// The fonts are fetched from the provider when the config loads, which CI's
		// test job cannot always reach (and never needs): skip them under Vitest and
		// in the no-1Password CI environment; builds still inline them.
		...(process.env.VITEST || process.env.SKIP_VARLOCK
			? []
			: [
					presetWebFonts({
						provider: "bunny",
						fonts: {
							// brand: "Bangers",
							// display: "Bahiana",
							mono: "Noto Mono",
							serif: "Noto Serif",
							sans: "Noto Sans",
							// sans: { name: "Atkinson Hyperlegible", weights: ["400", "700"] },
						},
					}),
				]),
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
			dark: {
				DEFAULT: "oklch(0.115 0.048 259.91)", // oxford
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
		"from-blue-950/20",
		"to-blue-950/40",
		"font-sans",
		"font-mono",
		"bg-dark",
		"bg-oxford",
		"bg-oxford-800",
		"bg-oxford-900",
		"bg-gradient-to-br",
		"bg-#090E19",
		"from-oxfordDark",
		"to-oxford",
		"text-slate-100",
		"max-w-screen",
		"overflow-x-hidden",
		"scroll-smooth",
		"text-on-dark",
		"grid",
		"grid-cols-1",
		"grid-rows-[auto_1fr_auto]",
		"min-h-screen",
		"via-dark",
		"w-full",
	],
	shortcuts: [
		["footer-link", "underline underline-offset-4 opacity-80 hover-opacity-100 hover-text-accent"],
		[
			"marketing-demo-heading",
			"mt-8 mb-3 text-blue-300 font-mono uppercase leading-tight text-0.9em",
		],
		[
			"marketing-demo-container",
			"bg-blue-300/5 -mx-4 px-4 pt-4 pb-5 border-y border-blue-300/10 shadow sm:mx-0 sm:px-5 sm:rounded-lg sm:border max-w-1600px",
		],
		[
			"marketing-headline",
			"font-serif max-w-prose mb-4 text-balance text-19px lg-text-24px leading-snug",
		],
		["marketing-box", "bg-blue-300/5 border rounded-md border-current/20 px-4 pt-4 pb-3"],
		["marketing-section-heading", "font-mono uppercase text-accent text-0.85em leading-tight mb-5"],
		["marketing-topic-heading", "leading-tight font-serif font-400 text-1.4em mb-2"],
		["marketing-paragraph", "mb-3 leading-relaxed font-sans opacity-80 text-blue-50 max-w-prose"],
		["marketing-faq-heading", "leading-tight font-serif font-400 text-1.2em mb-2"],
		["marketing-faq-text", "mb-3 leading-relaxed font-sans opacity-80 text-blue-50 text-0.95em"],
		["text-on-dark", "text-blue-50"],
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
		[
			"button-accent-solid",
			"button text-oxford bg-accent hover-outline outline-accent outline-offset-4 hover-text-oxford hover-shadow-lg",
		],
		[
			"button-record",
			"button button-sm border-none bg-red-600 text-white disabled-opacity-40 hover-bg-red-600 !hover-text-white text-nowrap",
		],
		["page-x-padding", "px-4 sm:px-6 md:px-7 lg:px-8 xl:px-16 2xl:px-24"],
		["home-page-x-padding", "px-4 sm:px-6 md:px-7 lg:px-8 xl:px-24 2xl:px-48"],
		["main-y-padding", "pt-10 pb-14 lg:(pt-12 pb-16) xl:(pt-14 pb-20) 2xl:(pt-16 pb-22)"],
		[
			"max-w-article",
			"max-w-none sm:max-w-[34rem] md:max-w-[36rem] lg:max-w-[38rem] xl:max-w-[40rem] 2xl:max-w-[45rem]",
		],
		["heading-1", "text-balance font-700 text-accent mb-3 text-32px lg:text-32px leading-snug"],
		["heading-2", "font-700 text-white mb-3 text-20px lg:text-22px"],
		["heading-3", "font-500 text-white mb-3 text-18px lg:text-18px"],
		[
			"nav-link",
			`
			decoration-current/10
			opacity-90
			underline
			underline-offset-4
			hover-opacity-100
			hover-text-accent`,
		],
		[
			"list-tile",
			"bg-blue-300/5 rounded-md border border-current/40 block px-4 py-3 text-18px hover-text-accent hover-border-accent hover-bg-accent/5 lg-text-20px leading-tight",
		],
		["app-page-heading", "font-serif text-24px lg-text-30px leading-snug"],
		[
			"app-list-tile",
			`bg-blue-100/5
			 border
			 border-current/40
			 block
			 leading-tight
			 px-4
			 py-3
			 rounded-md
			 text-18px
			 hover-border-accent
			 hover-bg-accent/5
			`,
		],
		["app-tile-meta", "mt-2 opacity-85 text-0.75em group-hover-opacity-100 leading-snug"],
		["app-tile-text", "mt-2 block text-0.8em opacity-90 leading-snug group-hover-opacity-100"],
		["app-tile-heading", "flex gap-2 items-center leading-tight"],

		["app-section-heading", "font-mono uppercase text-accent text-0.95em leading-tight mb-2"],
		["app-section-subheading", "opacity-90"],
		[
			"app-input-field",
			`
			bg-blue-100/5
			block
			border
			border-current/40
			leading-tight
			px-3
			py-2
			rounded-md
			text-18px
			hover-border-accent
			hover-bg-accent/5`,
		],
		[
			"app-input-field-lg",
			`
			bg-blue-100/5
			block
			border
			border-current/40
			leading-tight
			px-4
			py-3
			rounded-md
			text-18px
			w-full
			hover-border-accent
			hover-bg-accent/5`,
		],

		// ---- app ---------------------------------------------------------------
		["page", "page-x-padding main-y-padding grid grid-cols-1 gap-8 place-content-start"],
		["link-dim", "underline underline-offset-4 hover:text-accent"],
		["surface", "rounded border border-white/10 bg-row"],
		["tile", "border border-white/10 rounded p-6"],
		[
			"field",
			"block w-full rounded border border-white/15 bg-black/20 px-3 py-2 text-neutral-100 placeholder:text-slate-400 focus:(border-accent outline-none)",
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
				"[&>h1]:(text-22px font-700 text-accent)",
				"[&>h2]:(text-18px font-700 text-accent)",
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
				"[&>blockquote]:(pl-3 border-l-3 border-accent/60)",
				"[&>blockquote_+*]:mt-3",
				// code: chord grids
				"[&>pre]:(px-3.5 py-3 rounded-md bg-black/30 overflow-x-auto text-14px leading-normal)",
				"[&>pre_+*]:mt-4",
				"[&_code]:font-mono",
				"[&_:not(pre)>code]:(px-1.5 py-0.5 rounded bg-black/30)",
				// misc
				"[&>hr]:(border-0 border-t border-white/15 my-5)",
				"[&_a]:(underline underline-offset-3 text-accent)",
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
	rules: [],
});
