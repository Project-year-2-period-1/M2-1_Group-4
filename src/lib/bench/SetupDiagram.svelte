<!--
	Top-down view of the bench setup, roughly to scale (3 px per cm): the three sideways tape
	marks on the desk's front edge and the three depth poses of the head.
-->
<script lang="ts">
	/** Sideways tape offset in mm (the diagram's spacing stays fixed; only the label changes). */
	let { dx = 150 }: { dx?: number } = $props();
</script>

<svg
	viewBox="0 0 400 270"
	class="w-full max-w-md text-gray-800"
	role="img"
	aria-label="Top-down view: screen and webcam at the top, desk below with three tape marks on its front edge, and the head positions C, N, F, L and R beyond the desk."
	font-family="sans-serif"
	font-size="11"
>
	<!-- Desk and screen -->
	<rect x="60" y="20" width="280" height="90" fill="#e5e7eb" />
	<text x="68" y="100" fill="#6b7280">desk</text>
	<rect x="130" y="12" width="140" height="8" fill="#374151" />
	<circle cx="200" cy="16" r="3.5" fill="#ef4444" />
	<text x="278" y="20" fill="currentColor">screen, webcam (red)</text>

	<!-- Measurement line from webcam through the poses -->
	<line x1="200" y1="20" x2="200" y2="250" stroke="#9ca3af" stroke-dasharray="3 3" />

	<!-- Tape on the front edge -->
	{#each [{ x: 155, label: 'L' }, { x: 200, label: 'centre' }, { x: 245, label: 'R' }] as t (t.x)}
		<rect x={t.x - 6} y="106" width="12" height="8" fill="#f59e0b" />
		<text x={t.x} y="126" text-anchor="middle" fill="currentColor">{t.label}</text>
	{/each}
	<text x="262" y="114" fill="#b45309">← tape on the desk edge</text>
	<text x="177" y="140" text-anchor="middle" fill="#6b7280">{dx / 10} cm</text>
	<text x="223" y="140" text-anchor="middle" fill="#6b7280">{dx / 10} cm</text>

	<!-- Sideways positions: pose C, nose in line with the tape -->
	{#each [{ x: 155, label: 'L' }, { x: 245, label: 'R' }] as p (p.x)}
		<line x1={p.x} y1="114" x2={p.x} y2="181" stroke="#f59e0b" stroke-dasharray="2 3" />
		<circle cx={p.x} cy="195" r="14" fill="white" stroke="#0284c7" stroke-dasharray="4 3" />
		<text x={p.x} y="199" text-anchor="middle" fill="#0284c7" font-weight="bold">{p.label}</text>
	{/each}

	<!-- Depth poses on the centre line -->
	<circle cx="200" cy="165" r="12" fill="white" stroke="#16a34a" stroke-dasharray="4 3" />
	<text x="200" y="169" text-anchor="middle" fill="#16a34a" font-weight="bold">N</text>
	<circle cx="200" cy="195" r="14" fill="white" stroke="#0284c7" stroke-width="2" />
	<text x="200" y="199" text-anchor="middle" fill="#0284c7" font-weight="bold">C</text>
	<circle cx="200" cy="228" r="12" fill="white" stroke="#16a34a" stroke-dasharray="4 3" />
	<text x="200" y="232" text-anchor="middle" fill="#16a34a" font-weight="bold">F</text>

	<text x="20" y="169" fill="#16a34a">N: lean in</text>
	<text x="20" y="199" fill="#0284c7">C: sit normally</text>
	<text x="20" y="232" fill="#16a34a">F: lean back</text>
	<text x="275" y="222" fill="currentColor">measure each pose:</text>
	<text x="275" y="236" fill="currentColor">webcam → between</text>
	<text x="275" y="250" fill="currentColor">your eyes</text>
	<text x="200" y="266" text-anchor="middle" fill="#6b7280">(you, seen from above)</text>
</svg>
