import extractorSvelte from "@unocss/extractor-svelte";
import presetWind4 from "@unocss/preset-wind4";
import {
	defineConfig,
	presetWebFonts,
	transformerDirectives,
	transformerVariantGroup,
} from "unocss";
import { colors, lj } from "./src/lib/theme";

/**
 * Mirrors lightningjar.com's uno.config (lightning-jar/lj-website) so the
 * app shares its look: wind4 + reset, Atkinson Hyperlegible / Bungee Shade
 *  * from bunny, the same palette and shortcuts. On top of that, the
 * app's semantic colour tokens (see src/lib/theme.ts).
 */
export default defineConfig({
	content: {
		pipeline: { include: [/\.(svelte|md|json|html)($|\?)/] },
		filesystem: ["./src/app.html"],
	},
	extractors: [extractorSvelte()],
	preflights: [
		{
			layer: "preflights",
			getCSS: () => `html { --accent: ${lj.accent} }`,
		},
	],
	presets: [
		presetWind4({ preflights: { reset: true } }),
		presetWebFonts({
			provider: "bunny",
			fonts: {
				display: "Bungee Shade",
				sans: { name: "Atkinson Hyperlegible", weights: ["400", "700"] },
			},
		}),
	],
	theme: {
		colors: {
			...lj,
			...colors,
			accent: "var(--accent)", // themeable at runtime, like lj-website
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
			"flex max-w-fit gap-2 px-3 py-2 rounded border border-current opacity-90 text-[0.9em] hover:text-accent hover:opacity-100 hover:shadow hover:shadow-current disabled:(opacity-40 pointer-events-none)",
		],
		["button-accent", "button text-accent hover:text-oxford hover:bg-accent"],
		["page-x-padding", "px-4 sm:px-6 md:px-7 lg:px-8 xl:px-16 2xl:px-24"],
		["main-y-padding", "pt-10 pb-14 lg:(pt-12 pb-16) xl:(pt-14 pb-20) 2xl:(pt-16 pb-22)"],
		[
			"max-w-article",
			"max-w-none sm:max-w-[34rem] md:max-w-[36rem] lg:max-w-[38rem] xl:max-w-[40rem] 2xl:max-w-[45rem]",
		],
		[
			"display",
			"text-balance font-700 font-display text-maximumYellow mb-3 text-32px lg:text-42px leading-snug",
		],
		["heading-2", "font-700 text-maximumYellow mb-3 text-20px lg:text-24px"],

		// ---- app ---------------------------------------------------------------
		["page", "page-x-padding main-y-padding grid grid-cols-1 gap-8 place-content-start"],
		["link-dim", "text-dim underline underline-offset-4 hover:text-maximumYellow"],
		["surface", "rounded border border-white/10 bg-row"],
		["tile", "border border-white/10 rounded p-6"],
		[
			"field",
			"block w-full rounded border border-white/15 bg-black/20 px-3 py-2 text-neutral-100 placeholder:text-slate-400 focus:(border-maximumYellow outline-none)",
		],
		["tab", "px-3 py-1 text-xs"],
		["tab-active", "tab bg-maximumYellow text-oxford"],
		["tab-idle", "tab text-dim hover:text-neutral-100"],

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
				"[&>blockquote]:(pl-3 border-l-3 border-maximumYellow/60 text-dim)",
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
				"[&_section.footnotes]:(mt-6 pt-3 border-t border-white/15 text-13px text-dim)",
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
