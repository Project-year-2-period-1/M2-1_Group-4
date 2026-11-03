<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ESTIMATORS, comboKey, combosFor } from '$lib/bench/estimators';
	import type { CalibrationSample } from '$lib/bench/geometry';
	import { LiveTracker, type LiveUpdate } from '$lib/bench/live';
	import { ParallaxScene } from '$lib/bench/parallax';
	import { loadSetup, saveSetup } from '$lib/bench/screen';
	import SetupFields from '$lib/bench/SetupFields.svelte';
	import { TRACKERS, createTracker, type TrackerId } from '$lib/bench/trackers';
	import type { Vec3 } from '$lib/bench/types';

	let trackerId: TrackerId = $state('mediapipe');
	let comboId = $state('');
	let view: 'dot' | 'parallax' = $state('dot');
	let setup = $state(loadSetup());
	$effect(() => saveSetup($state.snapshot(setup)));

	let status: 'idle' | 'loading' | 'running' | 'error' = $state('idle');
	let error = $state('');
	let calibState: 'none' | 'sampling' | 'haveC' | 'done' = $state('none');
	let centreSample: CalibrationSample | null = null;

	let dot = $state<{ x: number; y: number } | null>(null);
	let position: Vec3 | null = $state(null);
	let procMs = $state(0);
	let fps = $state(0);
	let clock = $state('');

	let video: HTMLVideoElement;
	let sceneCanvas: HTMLCanvasElement;
	let live = $state<LiveTracker | null>(null);
	let scene: ParallaxScene | null = null;
	let raf = 0;
	let frames: number[] = [];

	const combos = $derived(live ? combosFor(live.tracker.landmarkSet) : []);

	function onUpdate(u: LiveUpdate) {
		dot = u.normalised;
		position = u.position;
		procMs = u.procMs;
		const now = performance.now();
		frames.push(now);
		while (frames[0] < now - 1000) frames.shift();
		fps = frames.length;
	}

	async function start() {
		status = 'loading';
		error = '';
		try {
			const tracker = await createTracker(trackerId);
			live = new LiveTracker(tracker, video, onUpdate);
			await live.start();
			comboId = comboKey(live.combo);
			calibState = 'none';
			status = 'running';
		} catch (e) {
			error = (e as Error).message;
			status = 'error';
			live = null;
		}
	}

	function stop() {
		live?.stop();
		live = null;
		status = 'idle';
	}

	function pickCombo(key: string) {
		if (!live) return;
		const [centre, size] = key.split('/');
		live.setCombo({ centre, size });
		calibState = 'none';
	}

	async function sampleMark() {
		if (!live) return;
		const had = calibState;
		calibState = 'sampling';
		try {
			const s = await live.sample();
			if (had === 'haveC') {
				live.calibrateFrom(centreSample!, s, setup.marks);
				calibState = 'done';
			} else {
				centreSample = s;
				calibState = 'haveC';
			}
		} catch (e) {
			error = (e as Error).message;
			calibState = had;
		}
	}

	onMount(() => {
		const loop = () => {
			clock = (performance.now() / 1000).toFixed(3);
			if (view === 'parallax' && position) {
				scene ??= new ParallaxScene(sceneCanvas, setup.screen);
				scene.render(position);
			}
			raf = requestAnimationFrame(loop);
		};
		loop();
		// Teardown here rather than onDestroy, which also runs during prerender.
		return () => {
			cancelAnimationFrame(raf);
			live?.stop();
			scene?.dispose();
		};
	});

	// Rebuild the scene if the screen geometry changes.
	$effect(() => {
		void $state.snapshot(setup.screen);
		scene?.dispose();
		scene = null;
	});

	const mm = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(0));
	const centreLabel = (id: string) =>
		live ? ESTIMATORS[live.tracker.landmarkSet].centres.find((c) => c.id === id)?.label : id;
</script>

<main class="grid min-h-screen gap-4 p-4 lg:grid-cols-[22rem_1fr]">
	<aside class="space-y-4 text-sm">
		<a class="underline" href={resolve('/bench')}>← Bench</a>
		<h1 class="text-xl font-bold">Live (real head)</h1>

		<fieldset class="space-y-2" disabled={status !== 'idle' && status !== 'error'}>
			<label class="block"
				>Tracker
				<select class="w-full" bind:value={trackerId}>
					{#each Object.entries(TRACKERS) as [id, t] (id)}
						<option value={id}>{t.label}</option>
					{/each}
				</select>
			</label>
		</fieldset>
		{#if status === 'running'}
			<button class="rounded bg-red-600 px-4 py-2 text-white" onclick={stop}>Stop</button>
		{:else}
			<button
				class="rounded bg-sky-600 px-4 py-2 text-white"
				disabled={status === 'loading'}
				onclick={start}>{status === 'loading' ? 'Loading…' : 'Start'}</button
			>
		{/if}
		{#if error}<p class="text-red-600">{error}</p>{/if}

		{#if live}
			<label class="block"
				>Estimator (centre / size)
				<select class="w-full" value={comboId} onchange={(e) => pickCombo(e.currentTarget.value)}>
					{#each combos as c (comboKey(c))}
						<option value={comboKey(c)}>{centreLabel(c.centre)} / {c.size}</option>
					{/each}
				</select>
			</label>

			<div class="space-y-2 rounded border p-3">
				<p class="font-semibold">
					Calibrate ({calibState === 'done' ? 'done' : 'needed for mm / parallax'})
				</p>
				{#if calibState === 'none' || calibState === 'done'}
					<button class="rounded border px-3 py-1" onclick={sampleMark}
						>Sit at mark C, then click</button
					>
				{:else if calibState === 'haveC'}
					<button class="rounded border px-3 py-1" onclick={sampleMark}
						>Now sit at mark R, then click</button
					>
				{:else}
					<p>Hold still…</p>
				{/if}
			</div>

			<div class="flex gap-2">
				<button
					class="rounded border px-3 py-1"
					class:bg-gray-200={view === 'dot'}
					onclick={() => (view = 'dot')}>Dot</button
				>
				<button
					class="rounded border px-3 py-1"
					class:bg-gray-200={view === 'parallax'}
					disabled={calibState !== 'done'}
					onclick={() => (view = 'parallax')}>Parallax scene</button
				>
			</div>

			<dl class="grid grid-cols-2 gap-1">
				<dt>FPS</dt>
				<dd>{fps}</dd>
				<dt>Processing ms</dt>
				<dd>{procMs.toFixed(1)}</dd>
				<dt>x / y / z mm</dt>
				<dd>{mm(position?.x)} / {mm(position?.y)} / {mm(position?.z)}</dd>
			</dl>
		{/if}

		<SetupFields bind:setup />

		<p class="text-xs text-gray-500">
			Latency: film the screen and your head together in 240 fps slow motion and count frames from
			head movement to dot movement. Run it with the mouse control too; that gives the display floor
			to subtract.
		</p>
	</aside>

	<section class="relative overflow-hidden rounded bg-slate-950">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={video}
			class="absolute top-2 right-2 z-10 w-48 -scale-x-100 rounded opacity-70"
			muted
			playsinline
		></video>
		<canvas bind:this={sceneCanvas} class="h-full w-full" class:hidden={view !== 'parallax'}
		></canvas>
		{#if view === 'dot' && dot}
			<div
				class="absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400"
				style:left="{dot.x * 100}%"
				style:top="{dot.y * 100}%"
			></div>
		{/if}
		<p class="absolute bottom-2 left-2 font-mono text-2xl text-white">{clock}</p>
	</section>
</main>
