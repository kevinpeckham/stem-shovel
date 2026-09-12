/**
 * Space is the transport from anywhere (DAW convention). The only exception
 * is text entry — inputs, textareas, the contenteditable editor, selects —
 * where Space must type a space.
 */
export function isTextEntry(t: EventTarget | null): boolean {
	if (!(t instanceof HTMLElement)) return false;
	if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)
		return true;
	if (t instanceof HTMLInputElement) {
		return !["button", "checkbox", "radio", "range", "file", "submit", "reset"].includes(t.type);
	}
	return false;
}
