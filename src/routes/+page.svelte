<script lang="ts">
	import { onMount } from 'svelte';
	import { IrisDistanceCamera } from '$lib/tracking/irisDistanceCamera';

	let video: HTMLVideoElement;
	let distanceCm: number | null = $state(null);
	let error: string | null = $state(null);

	onMount(() => {
		const camera = new IrisDistanceCamera(video, (distance, message) => {
			distanceCm = distance;
			error = message ?? null;
		});
		void camera.start();
		return () => camera.stop();
	});
</script>

<video bind:this={video} autoplay muted playsinline></video>
<p>Distance: {distanceCm?.toFixed(1) ?? '--'} cm</p>
{#if error}
	<p>Camera error: {error}</p>
{/if}
