/** Verovio ships no types; the few toolkit calls the notation worker makes (docs/uploads-and-blob.md, "Notation"). */
declare module "verovio/wasm" {
	const createVerovioModule: () => Promise<unknown>;
	export default createVerovioModule;
}
declare module "verovio/esm" {
	export class VerovioToolkit {
		constructor(module: unknown);
		destroy(): void;
		getPageCount(): number;
		getVersion(): string;
		loadData(data: string): boolean;
		loadZipDataBuffer(data: ArrayBuffer): boolean;
		renderToSVG(page?: number, xmlDeclaration?: boolean): string;
		setOptions(options: Record<string, unknown>): void;
	}
	export function enableLog(level: number, module: unknown): void;
	export const LOG_OFF: number;
}
