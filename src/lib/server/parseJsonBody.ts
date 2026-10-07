import { error } from "@sveltejs/kit";
import * as v from "valibot";

/** An API route's JSON body through its valibot schema: 400 with the first issue's message when it does not parse (or is not JSON). */
export async function parseJsonBody<S extends v.GenericSchema>(
	request: Request,
	schema: S,
): Promise<v.InferOutput<S>> {
	return parseBody(await request.json().catch(() => null), schema);
}

/** A body already read (a route that looks at a field before validating), through the schema the same way. */
export function parseBody<S extends v.GenericSchema>(body: unknown, schema: S): v.InferOutput<S> {
	const parsed = v.safeParse(schema, body);
	if (!parsed.success) error(400, parsed.issues[0]?.message ?? "Bad request");
	return parsed.output;
}
