import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";
import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("$lib/remote/share.remote", () => ({
	setProjectPrivate: fakeRemoteForm(),
	setSongPrivate: fakeRemoteForm(),
}));

const { default: PrivacyToggle } = await import("./PrivacyToggle.svelte");
const id = "V1StGXR8_Z5jdHi6B-myT";

describe("PrivacyToggle", () => {
	test("a public song offers to make it private", () => {
		render(PrivacyToggle, { props: { kind: "song", id, isPrivate: false, canChange: true } });
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Public");
		expect(screen.getByRole("button", { name: "Make private" })).toBeInTheDocument();
	});
	test("a private project explains who can open it and offers the way back", () => {
		render(PrivacyToggle, { props: { kind: "project", id, isPrivate: true, canChange: true } });
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Private");
		expect(screen.getByText(/this project and its songs/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Make public" })).toBeInTheDocument();
	});
	test("a song in a private project cannot be changed here", () => {
		render(PrivacyToggle, {
			props: { kind: "song", id, isPrivate: false, inherited: true, canChange: true },
		});
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Private");
		expect(screen.getByText(/The project is private/)).toBeInTheDocument();
		expect(screen.queryByRole("button")).toBeNull();
	});
	test("without permission there is no button", () => {
		render(PrivacyToggle, { props: { kind: "song", id, isPrivate: false, canChange: false } });
		expect(screen.queryByRole("button")).toBeNull();
	});
});
