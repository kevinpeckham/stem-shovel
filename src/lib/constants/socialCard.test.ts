import { describe, expect, test } from "vite-plus/test";
import { SOCIAL_CARD_ALT, SOCIAL_CARD_HEADLINE, SOCIAL_CARD_TAGLINE } from "./socialCard";

describe("SOCIAL_CARD_ALT", () => {
	test("carries the headline and the tagline the card draws", () => {
		expect(SOCIAL_CARD_ALT).toContain(SOCIAL_CARD_HEADLINE);
		expect(SOCIAL_CARD_ALT).toContain(SOCIAL_CARD_TAGLINE);
	});
});
