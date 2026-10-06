import { error } from "@sveltejs/kit";
import * as v from "valibot";

/** An API route's JSON body through its valibot schema: 400 with the first issue's message when it does not parse (or is not JSON). */
export async function parseJsonBody<S extends v.GenericSchema>(
	request: Request,
	schema: S,
): Promise<v.InferOutput<S>> {
	const parsed = v.safeParse(schema, await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.issues[0]?.message ?? "Bad request");
	return parsed.output;
}
