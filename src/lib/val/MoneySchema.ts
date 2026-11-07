import * as v from "valibot";
import { parseMoney } from "../utils/parseMoney";

const MONEY_MESSAGE = "Enter an amount like 450 or 450.50";
const COUNT_MESSAGE = "Enter a whole number";
/** The most a head count (tickets sold, attendance) may be. */
const MAX_COUNT = 1_000_000;

/** `parseMoney`, with the issue when the text does not read as an amount. */
function readCents(value: string, addIssue: (issue: { message: string }) => void): number | null {
	const cents = parseMoney(value);
	if (cents === null) addIssue({ message: MONEY_MESSAGE });
	return cents;
}

/** An amount of money as integer cents (the books, docs/band-plan.md phase 4): "450.50" → 45050, "" → null for not known. May be negative. */
export const MoneySchema = v.pipe(
	v.string(),
	v.trim(),
	v.rawTransform<string, number | null>(({ dataset, addIssue, NEVER }) => {
		if (dataset.value === "") return null;
		return readCents(dataset.value, addIssue) ?? NEVER;
	}),
);
export type Money = v.InferOutput<typeof MoneySchema>;

/** `MoneySchema` where an amount is required: "" is refused. */
export const MoneyRequiredSchema = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("Enter the amount"),
	v.rawTransform<string, number>(({ dataset, addIssue, NEVER }) => {
		return readCents(dataset.value, addIssue) ?? NEVER;
	}),
);
export type MoneyRequired = v.InferOutput<typeof MoneyRequiredSchema>;

/** A head count (tickets sold, attendance): "" → null for not known, else a whole number 0..1,000,000. */
export const CountSchema = v.pipe(
	v.string(),
	v.trim(),
	v.rawTransform<string, number | null>(({ dataset, addIssue, NEVER }) => {
		if (dataset.value === "") return null;
		const n = /^\d{1,7}$/.test(dataset.value) ? Number(dataset.value) : NaN;
		if (!(n <= MAX_COUNT)) {
			addIssue({ message: COUNT_MESSAGE });
			return NEVER;
		}
		return n;
	}),
);
export type Count = v.InferOutput<typeof CountSchema>;
