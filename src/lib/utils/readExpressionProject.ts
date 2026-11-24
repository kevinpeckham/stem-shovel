import * as v from "valibot";
import { DrumProjectSchema, DrumProjectV1Schema } from "#lib/val/DrumPatternSchema.js";
import { ExpressionProjectSchema, type ExpressionProject } from "#lib/val/ExpressionDrumSchema.js";
import { expressionProjectFromDrumProject } from "./expressionProjectFromDrumProject";
import { upgradeDrumProject } from "./upgradeDrumProject";

/**
 * Any stored beat as an expression drums project, or null when it is none:
 * an expression project as it is; a drum machine project (version 2, or
 * version 1 upgraded first) converted. The shapes tell them apart: an
 * expression cell is an object, a drum machine cell a number, so neither
 * passes the other's schema.
 */
export function readExpressionProject(data: unknown): ExpressionProject | null {
	const expression = v.safeParse(ExpressionProjectSchema, data);
	if (expression.success) return expression.output;
	const current = v.safeParse(DrumProjectSchema, data);
	if (current.success) return expressionProjectFromDrumProject(current.output);
	const first = v.safeParse(DrumProjectV1Schema, data);
	if (first.success) return expressionProjectFromDrumProject(upgradeDrumProject(first.output));
	return null;
}
