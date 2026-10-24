import { INSERT_DEFAULTS } from "#lib/constants/studioInserts.js";
import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import InsertPanel from "./InsertPanel.svelte";

/** The panel over a list of inserts: add, a slider's change, bypass, move, remove, each one `onchange` with the whole list. */
describe("InsertPanel", () => {
	test("adds an insert of a kind with its defaults", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		render(InsertPanel, { props: { inserts: [], onchange, label: "Guitar" } });
		expect(screen.getByText(/No inserts yet/)).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Add EQ" }));
		const [list] = onchange.mock.calls[0]!;
		expect(list).toHaveLength(1);
		expect(list[0].kind).toBe("eq");
		expect(list[0].settings).toEqual(INSERT_DEFAULTS.eq);
		expect(list[0].id).toHaveLength(21);
	});

	test("a slider sets one setting, bypass marks the insert, the arrows move it, the cross removes it", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		const inserts = [
			{ id: "a", kind: "eq" as const, settings: { ...INSERT_DEFAULTS.eq } },
			{ id: "b", kind: "delay" as const, settings: { ...INSERT_DEFAULTS.delay } },
		];
		render(InsertPanel, { props: { inserts, onchange, label: "Guitar" } });
		await fireEvent.input(screen.getByRole("slider", { name: "EQ Low" }), {
			target: { value: "3" },
		});
		expect(onchange.mock.calls.at(-1)![0][0].settings.lowGain).toBe(3);
		await user.click(screen.getByRole("button", { name: "Bypass EQ" }));
		expect(onchange.mock.calls.at(-1)![0][0].bypass).toBe(true);
		await user.click(screen.getByRole("button", { name: "Move Delay up" }));
		expect(onchange.mock.calls.at(-1)![0].map((i: { id: string }) => i.id)).toEqual(["b", "a"]);
		await user.click(screen.getByRole("button", { name: "Remove EQ" }));
		expect(onchange.mock.calls.at(-1)![0].map((i: { id: string }) => i.id)).toEqual(["b"]);
		await user.click(screen.getByRole("checkbox", { name: "Analog repeats" }));
		expect(onchange.mock.calls.at(-1)![0][1].settings.analog).toBe(false);
	});

	test("a delay's Sync holds its time to a note value of the song; Free gives the slider back", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		const inserts = [{ id: "d", kind: "delay" as const, settings: { ...INSERT_DEFAULTS.delay } }];
		const view = render(InsertPanel, { props: { inserts, onchange, label: "Guitar" } });
		expect(screen.getByRole("slider", { name: "Delay Time" })).toBeEnabled();
		await user.selectOptions(screen.getByRole("combobox", { name: "Delay sync" }), "0.75");
		expect(onchange.mock.calls.at(-1)![0][0].settings.sync).toBe(0.75);
		await view.rerender({
			inserts: inserts.map((i) => ({ ...i, settings: { ...i.settings, sync: 0.75 } })),
		});
		expect(screen.getByRole("slider", { name: "Delay Time" })).toBeDisabled();
		expect(screen.getByText(/1\/8 dotted at the song's tempo/)).toBeInTheDocument();
		await user.selectOptions(screen.getByRole("combobox", { name: "Delay sync" }), "0");
		expect(onchange.mock.calls.at(-1)![0][0].settings.sync).toBe(0);
	});

	test("an automated parameter says so", () => {
		render(InsertPanel, {
			props: {
				inserts: [{ id: "a", kind: "reverb", settings: { ...INSERT_DEFAULTS.reverb } }],
				onchange: vi.fn(),
				label: "Bus",
				automated: new Set(["insert:a:level"]),
			},
		});
		expect(screen.getByText("(automated)")).toBeInTheDocument();
	});
});
