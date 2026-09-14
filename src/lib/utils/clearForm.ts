/**
 * Forget what a remote form last held. A `form` from `$app/server` keeps
 * every submitted or edited value in module state for the life of the
 * page (and across client-side navigations), so a popover reopened after a
 * submission shows the previous entry; `.as(type, value)` defaults only
 * apply while a field has no stored value. Emptying the store puts every
 * input back on its default. Call it when a popover opens, or after a
 * successful submission of a form that stays on the page.
 */
export function clearForm(form: { fields: { set: (value: never) => unknown } }): void {
	form.fields.set({} as never);
}
