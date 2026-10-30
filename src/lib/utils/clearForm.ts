import { tick } from "svelte";

/**
 * Forget what a remote form last held. A `form` from `$app/server` keeps
 * every submitted or edited value in module state for the life of the
 * page (and across client-side navigations), so a popover reopened after a
 * submission shows the previous entry; `.as(type, value)` defaults only
 * apply while a field has no stored value. Emptying the store puts every
 * input back on its default. Call it when a popover opens, or after a
 * successful submission of a form that stays on the page.
 *
 * Pass the `<form>` element too whenever the caller has it: the remote
 * form also keeps a set of DIRTY fields (ones the person typed in), and a
 * dirty field with no stored value renders EMPTY instead of falling back
 * to its default (`read()` in SvelteKit's form-utils). Only a native reset
 * of the element clears that set, so without the element a field someone
 * edited comes back blank the next time the form opens, and a save then
 * writes the blank (FINDINGS.md "A remote form's dirty fields survive
 * clearForm", 2026-10-30). The store is emptied first; the reset then
 * stores the defaults the DOM shows.
 */
export function clearForm(
	form: { fields: { set: (value: never) => unknown } },
	element?: HTMLFormElement | null,
): void {
	if (!element) {
		form.fields.set({} as never);
		return;
	}
	// The order matters: the remote form's own reset handler runs a tick after
	// the reset event and snapshots the DOM into the store (and clears dirty).
	// Emptying the store first would re-render the dirty fields as "" before
	// that snapshot, and the snapshot would keep the "". So reset, let the
	// handler run, then empty the store so the defaults apply again.
	HTMLFormElement.prototype.reset.call(element);
	void tick()
		.then(tick)
		.then(() => form.fields.set({} as never));
}
