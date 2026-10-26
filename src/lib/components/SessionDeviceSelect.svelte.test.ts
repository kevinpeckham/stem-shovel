import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vite-plus/test";
import { SESSION_DEVICE_OPTIONS } from "#lib/constants/sessionRecordings.js";
import type { SessionDevice } from "#lib/val/SessionRecordingSchema.js";
import SessionDeviceSelect from "./SessionDeviceSelect.svelte";

describe("SessionDeviceSelect", () => {
	test("labels the select and lists unset, then the device kinds in order", () => {
		render(SessionDeviceSelect, { props: { value: "", title: "What captured it" } });
		const select = screen.getByLabelText("Input device");
		expect(select).toHaveAttribute("title", "What captured it");
		const options = [...select.querySelectorAll("option")].map((o) => [o.value, o.textContent]);
		expect(options).toEqual([["", "—"], ...SESSION_DEVICE_OPTIONS.map((o) => [o.value, o.label])]);
	});

	test("the bound value follows a change", async () => {
		const user = userEvent.setup();
		let value: SessionDevice = "";
		render(SessionDeviceSelect, {
			props: {
				get value() {
					return value;
				},
				set value(v: SessionDevice) {
					value = v;
				},
			},
		});
		await user.selectOptions(screen.getByLabelText("Input device"), "phone");
		expect(value).toBe("phone");
	});

	test("shows the bound value and takes the label classes", () => {
		const { container } = render(SessionDeviceSelect, {
			props: { value: "soundboard", class: "grid gap-1 text-12px text-dim" },
		});
		expect(screen.getByLabelText("Input device")).toHaveValue("soundboard");
		expect(container.querySelector("label")).toHaveClass("text-12px");
	});
});
