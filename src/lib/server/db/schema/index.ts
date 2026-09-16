// One file per table, relations declared beside each table. drizzle-kit loads
// this barrel outside SvelteKit, so schema files use relative imports only.
export * from "./account";
export * from "./aiRequest";
export * from "./accountMember";
export * from "./authAccount";
export * from "./bugReport";
export * from "./comment";
export * from "./demo";
export * from "./invitation";
export * from "./inviteCode";
export * from "./project";
export * from "./relations";
export * from "./session";
export * from "./shareLink";
export * from "./song";
export * from "./songDocVersion";
export * from "./stem";
export * from "./user";
export * from "./userDoc";
export * from "./userDocVersion";
export * from "./verification";
