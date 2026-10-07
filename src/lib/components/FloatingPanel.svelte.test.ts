import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { createRawSnippet } from "svelte";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import FloatingPanel from "./FloatingPanel.svelte";

const children = createRawSnippet(() => ({ render: () => `<p>Panel body</p>` }));
const controls = createRawSnippet(() => ({
	render: () => `<button type="button">Pop out</button>`,
}));

/** The panel's place and size, as the `--fp-*` style props the classes read. */
function placeOf(panel: HTMLElement) {
	const prop = (name: string) => panel.style.getPropertyValue(name);
	return { x: prop("--fp-x"), y: prop("--fp-y"), w: prop("--fp-w"), h: prop("--fp-h") };
}
const zOf = (panel: HTMLElement) => Number(panel.style.getPropertyValue("--fp-z"));

function viewport(width: number, height: number) {
	Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
	Object.defineProperty(window, "innerHeight", {
		value: height,
		configurable: true,
		writable: true,
	});
}

const base = { title: "Drums", storageKey: "fp-test", children, onminimise: () => {} };

describe("FloatingPanel", () => {
	beforeEach(() => {
		localStorage.clear();
		viewport(1280, 800);
	});

	test("open: a dialog named by the title, with the title and the children", () => {
		render(FloatingPanel, { props: { ...base, open: true } });
		const panel = screen.getByRole("dialog", { name: "Drums" });
		expect(panel).toHaveTextContent("Drums");
		expect(screen.getByText("Panel body")).toBeInTheDocument();
		expect(panel).not.toHaveClass("!hidden");
	});

	test("closed: gone without keep, mounted but hidden with keep", () => {
		const { unmount } = render(FloatingPanel, { props: { ...base, open: false } });
		expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
		unmount();
		render(FloatingPanel, { props: { ...base, open: false, keep: true } });
		const panel = screen.getByRole("dialog", { name: "Drums", hidden: true });
		expect(panel).toHaveClass("!hidden");
		expect(screen.getByText("Panel body")).toBeInTheDocument();
	});

	test("the close button minimises; closable={false} leaves it out", async () => {
		const user = userEvent.setup();
		const onminimise = vi.fn();
		const { unmount } = render(FloatingPanel, { props: { ...base, open: true, onminimise } });
		await user.click(screen.getByRole("button", { name: "Close Drums" }));
		expect(onminimise).toHaveBeenCalledTimes(1);
		unmount();
		render(FloatingPanel, { props: { ...base, open: true, closable: false } });
		expect(screen.queryByRole("button", { name: "Close Drums" })).toBeNull();
	});

	test("the controls snippet renders in the header, before the close button", () => {
		render(FloatingPanel, { props: { ...base, open: true, controls } });
		const header = screen.getByRole("dialog").querySelector("header");
		const buttons = [...(header?.querySelectorAll("button") ?? [])].map((b) =>
			b.textContent?.trim(),
		);
		expect(buttons).toEqual(["Pop out", ""]);
		expect(screen.getByRole("button", { name: "Pop out" })).toBeInTheDocument();
	});

	test("without a remembered place the panel sits at the top right, sized by its props", () => {
		render(FloatingPanel, { props: { ...base, open: true, width: 760, height: 600 } });
		const panel = screen.getByRole("dialog");
		// x = innerWidth - w - 24, y = 96.
		expect(placeOf(panel)).toEqual({ x: "496px", y: "96px", w: "760px", h: "600px" });
	});

	test("a remembered place is read from localStorage and clamped into the viewport", () => {
		// Off screen on every side, and sized both under the minimum and past the viewport.
		localStorage.setItem("fp-test", JSON.stringify({ x: 5000, y: -20, w: 100, h: 10000 }));
		render(FloatingPanel, { props: { ...base, open: true } });
		const panel = screen.getByRole("dialog");
		expect(placeOf(panel)).toEqual({
			x: "1160px", // innerWidth - 120: the header stays reachable
			y: "8px",
			w: "480px", // the minimum the handle allows
			h: "784px", // innerHeight - 16
		});
	});

	test("a remembered place inside the viewport is used as is", () => {
		localStorage.setItem("fp-test", JSON.stringify({ x: 300, y: 200, w: 640, h: 400 }));
		render(FloatingPanel, { props: { ...base, open: true } });
		expect(placeOf(screen.getByRole("dialog"))).toEqual({
			x: "300px",
			y: "200px",
			w: "640px",
			h: "400px",
		});
	});

	test("a corrupt remembered place keeps the initial place and the prop size", () => {
		// JSON.parse throws, and the catch skips the default placement too (unlike a missing
		// entry, which goes to the top right): the panel keeps its initial x/y with the prop size.
		localStorage.setItem("fp-test", "{not json");
		render(FloatingPanel, { props: { ...base, open: true } });
		expect(placeOf(screen.getByRole("dialog"))).toEqual({
			x: "24px",
			y: "96px",
			w: "760px",
			h: "600px",
		});
	});

	test("a pointerdown inside a panel raises it above the others", async () => {
		render(FloatingPanel, { props: { ...base, open: true, title: "First", storageKey: "fp-1" } });
		render(FloatingPanel, { props: { ...base, open: true, title: "Second", storageKey: "fp-2" } });
		const first = screen.getByRole("dialog", { name: "First" });
		const second = screen.getByRole("dialog", { name: "Second" });
		// The later one opened on top.
		expect(zOf(second)).toBeGreaterThan(zOf(first));
		await fireEvent.pointerDown(
			screen.getByText("Panel body", { selector: "[aria-label=First] p" }),
		);
		expect(zOf(first)).toBeGreaterThan(zOf(second));
		// Focus inside the other one brings it back up.
		await fireEvent.focusIn(screen.getByRole("button", { name: "Close Second" }));
		expect(zOf(second)).toBeGreaterThan(zOf(first));
	});

	test("dragging the header moves the panel only when it is position: fixed (never in jsdom)", async () => {
		render(FloatingPanel, { props: { ...base, open: true } });
		const panel = screen.getByRole("dialog");
		const header = panel.querySelector("header") as HTMLElement;
		const before = placeOf(panel);
		// jsdom computes no layout and the `lg-fixed` class has no stylesheet here, so the
		// panel reads as docked: the drag guard refuses, as it does below the lg breakpoint.
		expect(getComputedStyle(panel).position).not.toBe("fixed");
		const capture = vi.fn();
		header.setPointerCapture = capture;
		await fireEvent.pointerDown(header, { clientX: 500, clientY: 100, pointerId: 1 });
		await fireEvent.pointerMove(header, { clientX: 700, clientY: 300, pointerId: 1 });
		await fireEvent.pointerUp(header, { clientX: 700, clientY: 300, pointerId: 1 });
		expect(placeOf(panel)).toEqual(before);
		expect(capture).not.toHaveBeenCalled();
		expect(localStorage.getItem("fp-test")).toBeNull();
	});
});
