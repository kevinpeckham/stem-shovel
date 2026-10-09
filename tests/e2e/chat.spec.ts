import { expect, open, test } from "./fixtures";

/**
 * The song chat (docs/chat.md) on the bot's test song: the Chat panel from
 * the header's button, a message sent with Enter and shown at once with its position as a seek
 * button, edited in place, then deleted so the chat is left as found.
 * The tests run in order and share the message.
 */
const SONG = process.env.E2E_SONG ?? "/mmkk/projects/badverbs/eat-all-the-clocks";
const STAMP = `e2e ${Date.now()}`;

test.describe.configure({ mode: "serial" });

test("sends a message from the Chat panel, with a position that seeks", async ({
	page,
	errors,
}) => {
	await open(page, SONG);
	await page.getByRole("button", { name: /^Chat/ }).click();
	const chat = page.getByRole("dialog", { name: "Chat" });
	await expect(chat).toBeVisible();
	const box = chat.getByRole("textbox", { name: "Message" });
	await box.fill(`${STAMP} the drop at 0:05 is late`);
	await box.press("Enter");
	const message = chat.locator("[data-chat-message]", { hasText: STAMP });
	await expect(message).toBeVisible();
	await expect(box).toHaveValue("");
	// The position is a button that seeks.
	await message.getByRole("button", { name: "0:05" }).click();
	expect(errors).toEqual([]);
});

test("the author edits the message in place and deletes it", async ({ page }) => {
	await open(page, SONG);
	await page.getByRole("button", { name: /^Chat/ }).click();
	const chat = page.getByRole("dialog", { name: "Chat" });
	const message = chat.locator("[data-chat-message]", { hasText: STAMP });
	await expect(message).toBeVisible();
	await message.hover();
	await message.getByRole("button", { name: "Edit message" }).click();
	const box = chat.getByRole("textbox", { name: "Edit message" });
	await box.fill(`${STAMP} the drop is fine`);
	await box.press("Enter");
	await expect(message).toContainText("the drop is fine");
	await expect(message).toContainText("(edited)");
	page.once("dialog", (d) => void d.accept());
	await message.hover();
	await message.getByRole("button", { name: "Delete message" }).click();
	await expect(message).toHaveCount(0);
	await page.reload();
	await page.getByRole("button", { name: /^Chat/ }).click();
	await expect(chat.locator("[data-chat-message]", { hasText: STAMP })).toHaveCount(0);
});
