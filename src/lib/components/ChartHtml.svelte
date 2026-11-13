<script lang="ts">
	import { tick } from "svelte";
	import { notify } from "#lib/state/notifications.svelte.js";

	/**
	 * A chord chart's rendered HTML in the page: barmark's `<barmark-chart>`
	 * with its declarative shadow root (`renderChartHtml`), or the old
	 * typography while the chart is not yet barmark (then the HTML is
	 * renderMarkdown's, and the wrapper's `chart-body` styles it). Svelte
	 * inserts `{@html}` through innerHTML, which leaves a declarative shadow
	 * root's <template> inert, so once the nodes are in the document the
	 * chart is parsed again with setHTMLUnsafe unless it has its shadow root
	 * already (the page's own HTML, parsed by the browser). `{#key}` remounts
	 * on new HTML, so that re-parse never fights the block's own update.
	 *
	 * With `numerals` (the Chords view's Nashville or Roman spelling) the
	 * element module loads and the chart is handed its `markdown` as `text`:
	 * a server-drawn chart has no text of its own, so a `numerals` attribute
	 * alone would only restyle it. Back to null after that, the element
	 * redraws from the same text with chord names. `text` (the Key menu's
	 * transposition) is drawn in place of `markdown` the same way. Never set,
	 * nothing loads and the server's HTML stays as it is.
	 *
	 * The song's own chart comes as `<barmark-score>` (`renderScoreChartHtml`):
	 * the same grid with a Grid / Score switch, which is inert until the
	 * element upgrades, so its module always loads after the re-parse. That
	 * import registers both elements and does not load Verovio: the element
	 * loads it in its worker on the first switch to the score. `numerals` and
	 * `text` go to whichever element the HTML holds; both take them.
	 *
	 * When the score cannot be drawn (`@barmark/score` 0.4: Verovio refused
	 * the chart, failed to load or timed out) the element keeps the grid and
	 * fires `scoreerror` (bubbles, composed) with the reason; the wrapper
	 * hears it and shows the reason as an error notification, with the way
	 * out.
	 *
	 * The Grid / Score choice is ours (ChartViewSwitch in the chart's
	 * toolbar): `view` goes to the element as its `view` attribute, once it
	 * is drawn and on every change, and a stylesheet added to its open shadow
	 * root hides the element's own switch and puts its loading and "couldn't
	 * be drawn" notes on paper. The element's `viewchange` (bubbles, composed) reports the
	 * view it now shows, back to grid when the score fails, to `onviewchange`.
	 */
	interface Props {
		html: string;
		/** The chart text, which the element redraws from when spelled as numerals. */
		markdown?: string;
		numerals?: "nashville" | "roman" | null;
		/** The chart to draw instead of `markdown`: the Key menu's transposition, null in the original key. */
		text?: string | null;
		/** The chart's background in place of the look's paper (`--barmark-paper`); null for the look's own. */
		paper?: string | null;
		/** The `<barmark-score>`'s view, the toolbar's Grid / Score; a grid-only chart ignores it. */
		view?: "grid" | "score";
		/** The view the element now shows, from its `viewchange`. */
		onviewchange?: (view: "grid" | "score") => void;
	}
	let {
		html,
		markdown,
		numerals = null,
		text: textProp = null,
		paper = null,
		view = "grid",
		onviewchange,
	}: Props = $props();

	/** The score element's `scoreerror`: its `detail.reason` is barmark's sentence. */
	function scoreError(e: CustomEvent<{ reason?: string }>) {
		const reason = e.detail?.reason;
		notify(
			`The score can't be drawn${reason ? `: ${reason.replace(/\.$/, "")}` : ""}. Fix it in the text and the score follows.`,
			{ kind: "error" },
		);
	}

	type ChartElement = HTMLElement & { text: string | null; numerals: string | null };
	/** The grid alone (`renderChartHtml`) or the grid with its score switch (`renderScoreChartHtml`). */
	const CHARTS = "barmark-chart, barmark-score";
	/** The element has been given text, so a return to names must be drawn too. */
	let drawn = false;

	/** Parses the HTML again when Svelte's innerHTML left the declarative shadow root inert. */
	function reparse(node: HTMLElement, html: string) {
		const chart = node.querySelector(CHARTS);
		if (chart && !chart.shadowRoot && "setHTMLUnsafe" in node) node.setHTMLUnsafe(html);
	}

	/** Loads the element module the HTML needs: the score's always (its switch), the grid's only to redraw. */
	async function upgrade(node: HTMLElement, redraw: boolean) {
		if (node.querySelector("barmark-score")) await import("@barmark/score/element");
		else if (redraw) await import("@barmark/render/element");
	}

	/**
	 * Our rules in the score element's shadow root: its own Grid / Score
	 * switch hidden (ours is in the toolbar), and its loading and
	 * "couldn't be drawn" notes on the look's paper, as the grid is, since
	 * they take the ink's color and would otherwise sit dark on the page.
	 */
	const SCORE_SHADOW_RULES =
		".bms-switch{display:none}.bms-loading,.bms-note{background:var(--barmark-paper,#fff);padding:1em 1.2em}";
	/** Adds `SCORE_SHADOW_RULES` to the element's open shadow root. jsdom has no constructable stylesheets, so it skips there. */
	function styleShadow(element: Element) {
		const root = element.shadowRoot;
		if (!root || typeof CSSStyleSheet !== "function" || !("adoptedStyleSheets" in root)) return;
		try {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(SCORE_SHADOW_RULES);
			root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
		} catch {
			// An older engine: the element's switch shows beside ours.
		}
	}

	/** The toolbar's view to the score element, once it is in the page (a new closure per value re-runs it). */
	const applyView = (shown: "grid" | "score") => (node: HTMLElement) => {
		void tick().then(() => node.querySelector("barmark-score")?.setAttribute("view", shown));
	};

	/** The element's `viewchange`: the view it now shows. */
	function viewChange(e: CustomEvent<{ view?: string }>) {
		onviewchange?.(e.detail?.view === "score" ? "score" : "grid");
	}

	const draw = (html: string) => (node: HTMLElement) => {
		const dialect = numerals;
		const moved = !!textProp && textProp !== markdown;
		const text = textProp ?? markdown ?? "";
		const redraw = !!dialect || moved || drawn;
		let live = true;
		void tick().then(async () => {
			reparse(node, html);
			await upgrade(node, redraw);
			// Queried again: the re-parse above replaced the element.
			const element = node.querySelector<ChartElement>(CHARTS);
			if (live && element?.localName === "barmark-score") {
				element.setAttribute("view", view);
				styleShadow(element);
			}
			if (!redraw || !live || !element) return;
			element.numerals = dialect;
			element.text = text;
			drawn = true;
		});
		return () => {
			live = false;
		};
	};
</script>

{#key html}
	<!-- barmark.dev's chart look (uno.config.ts): the renderer's palette reads these custom properties from its host. -->
	<div
		class="barmark-look min-w-0"
		style:--barmark-paper={paper}
		onscoreerror={scoreError}
		onviewchange={viewChange}
		{@attach draw(html)}
		{@attach applyView(view)}
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderChartHtml escapes what it draws; renderMarkdown is sanitized -->
		{@html html}
	</div>
{/key}
