<script lang="ts">
	import { looksLikeCm } from './protocol';
	import type { LiveSetup } from './screen';

	let { setup = $bindable() }: { setup: LiveSetup } = $props();
</script>

<fieldset class="space-y-2">
	<legend class="font-semibold">Screen & marks (mm)</legend>
	{#if looksLikeCm(setup.marks)}
		<p class="font-semibold text-red-600">
			These look like centimetres. Enter millimetres: 38 cm is 380.
		</p>
	{/if}
	<div class="grid grid-cols-2 gap-2">
		<label
			>Screen width <input class="w-full" type="number" bind:value={setup.screen.width} /></label
		>
		<label
			>Screen height <input class="w-full" type="number" bind:value={setup.screen.height} /></label
		>
		<label
			>Camera x from screen centre <input
				class="w-full"
				type="number"
				bind:value={setup.screen.cameraOffset.x}
			/></label
		>
		<label
			>Camera y above screen centre <input
				class="w-full"
				type="number"
				bind:value={setup.screen.cameraOffset.y}
			/></label
		>
		<label
			>C: sitting normally, webcam to eyes <input
				class="w-full"
				type="number"
				bind:value={setup.marks.z0}
			/></label
		>
		<label
			>R tape: distance from centre tape <input
				class="w-full"
				type="number"
				bind:value={setup.marks.dx}
			/></label
		>
	</div>
	<p class="text-xs text-gray-500">
		Calibrate by sitting normally with your nose in line with the centre tape, then with your nose
		in line with the R tape. Vertical position is measured from your eye height at calibration.
	</p>
</fieldset>
