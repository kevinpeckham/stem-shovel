/**
 * Cents as money in the account's currency: 45000 USD → "$450.00",
 * -2000 USD → "-$20.00". A currency code Intl refuses falls back to
 * "450.00 XYZ".
 */
export function formatCents(cents: number, currency: string): string {
	try {
		return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
	} catch {
		return `${(cents / 100).toFixed(2)} ${currency}`;
	}
}
