<script lang="ts">
	import type { Attachment } from "svelte/attachments";

	/** A QR code on a canvas; the library is browser-only, loaded when the canvas mounts. */
	interface Props {
		data: string;
		size?: number;
	}
	let { data, size = 200 }: Props = $props();

	function render(value: string, width: number): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			if (!value) return;
			void import("qrcode").then((QRCode) => QRCode.toCanvas(canvas, value, { width }));
		};
	}
</script>

<canvas {@attach render(data, size)} class="rounded bg-white" width={size} height={size}></canvas>
