import * as v from "valibot";
import { DrumProjectSchema } from "./DrumPatternSchema";

/** A system admin makes the beat in the home page's drum machine the one a first visit opens with. */
export const HomeBeatSchema = v.object({ data: DrumProjectSchema });
