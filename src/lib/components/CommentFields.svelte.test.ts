import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

const { default: CommentFields } = await import("./CommentFields.svelte");

/** A remote form field stand-in: spreads its name and value, records a set, reports the given issues. */
function field(name: string, issues?: { message: string }[]) {
	return {
		as: (_type: string, value: string) => ({ name, value }),
		issues: () => issues,
		set: vi.fn(),
	};
}

function setup(playhead = { disabled: false, read: () => "2|1" }) {
	const fields = {
		title: field("title"),
		body: field("body"),
		position: field("position", [{ message: "Not a position" }]),
	};
	render(CommentFields, {
		props: {
			fields: fields as never,
			draft: { title: "Bridge", body: "Too loud", at: "12|3" },
			hint: "optional, as time",
			placeholder: "1:23.4",
			playhead,
		},
	});
	return fields;
}

describe("CommentFields", () => {
	test("the three fields start at the draft, the position with its hint, placeholder and issue", () => {
		setup();
		expect(screen.getByLabelText("Title")).toHaveValue("Bridge");
		expect(screen.getByLabelText("Comment")).toHaveValue("Too loud");
		const position = screen.getByLabelText(/Position \(optional, as time\)/);
		expect(position).toHaveValue("12|3");
		expect(position).toHaveAttribute("placeholder", "1:23.4");
		expect(screen.getByText("Not a position")).toBeTruthy();
	});

	test("Playhead sets the position from the reader", async () => {
		const fields = setup();
		await fireEvent.click(screen.getByRole("button", { name: "Playhead" }));
		expect(fields.position.set).toHaveBeenCalledWith("2|1");
	});

	test("a disabled Playhead carries its reason", () => {
		setup({ disabled: true, title: "Play the recording first", read: () => "" } as never);
		const button = screen.getByRole("button", { name: "Playhead" });
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute("title", "Play the recording first");
	});
});
