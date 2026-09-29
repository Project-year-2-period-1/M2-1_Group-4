<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ESTIMATORS, comboKey, combosFor } from '$lib/bench/estimators';
	import type { CalibrationSample } from '$lib/bench/geometry';
	import { LiveTracker } from '$lib/bench/live';
	import { ParallaxScene } from '$lib/bench/parallax';
	import { loadSetup, saveSetup } from '$lib/bench/screen';
	import { download } from '$lib/bench/session';
	import SetupFields from '$lib/bench/SetupFields.svelte';
	import { TRACKERS, createTracker, type TrackerId } from '$lib/bench/trackers';
	import type { Vec3 } from '$lib/bench/types';

	/**
	 * Blind A/B: the participant sees "Condition 1/2" only; which arm is which is randomised
	 * per trial and revealed in the CSV. Works for suite 1 (tracker vs tracker) and suite 2
	 * (same tracker, different estimators, e.g. cyclopean vs single-eye).
	 */
	interface Arm {
		tracker: TrackerId;
		combo: string;
	}
	interface Rating {
		depth: number;
		comfort: number;
	}
	interface TrialResult {
		trial: number;
		first: 'A' | 'B';
		ratings: Record<'A' | 'B', Rating>;
		preferred: 'A' | 'B';
	}

	let arms: Record<'A' | 'B', Arm> = $state({
		A: { tracker: 'opencv', combo: 'canthiMid/outerCanthi' },
		B: { tracker: 'mediapipe', combo: 'irisMid/irisDiameter' }
	});
	let participant = $state('');
	let trialCount = $state(4);
	let showSeconds = $state(15);
	let setup = $state(loadSetup());
	$effect(() => saveSetup($state.snapshot(setup)));

	type Phase = 'setup' | 'loading' | 'calibrateC' | 'calibrateR' | 'viewing' | 'rating' | 'done';
	let phase: Phase = $state('setup');
	let error = $state('');
	let trial = $state(0);
	let order: ('A' | 'B')[] = $state([]);
	let showing = $state(0); // index into order
	let remaining = $state(0);
	let results: TrialResult[] = $state([]);
	let draft = $state({ r1: { depth: 4, comfort: 4 }, r2: { depth: 4, comfort: 4 }, pref: 0 });

	let video: HTMLVideoElement;
	let canvas: HTMLCanvasElement;
	let live: Partial<Record<'A' | 'B', LiveTracker>> = {};
	let scene: ParallaxScene | null = null;
	let latest: Vec3 | null = null;
	let raf = 0;
	let centreSamples: Partial<Record<'A' | 'B', CalibrationSample>> = {};

	const combosOf = (id: TrackerId) => combosFor(TRACKERS[id].landmarkSet).map(comboKey);

	async function begin() {
		phase = 'loading';
		error = '';
		try {
			// Sequential: the first LiveTracker opens the camera, the second reuses it.
			for (const k of ['A', 'B'] as const) {
				const l = new LiveTracker(await createTracker(arms[k].tracker), video, (u) => {
					if (l.active && u.position) latest = u.position;
				});
				await l.start();
				const [centre, size] = arms[k].combo.split('/');
				l.setCombo({ centre, size });
				live[k] = l;
			}
			phase = 'calibrateC';
		} catch (e) {
			error = (e as Error).message;
			phase = 'setup';
		}
	}

	async function sample() {
		const both = [live.A!, live.B!];
		both.forEach((l) => (l.active = true));
		try {
			const [a, b] = await Promise.all(both.map((l) => l.sample()));
			if (phase === 'calibrateC') {
				centreSamples = { A: a, B: b };
				phase = 'calibrateR';
			} else {
				live.A!.calibrateFrom(centreSamples.A!, a, setup.marks);
				live.B!.calibrateFrom(centreSamples.B!, b, setup.marks);
				startTrial(0);
			}
		} catch (e) {
			error = (e as Error).message;
		}
	}

	function startTrial(i: number) {
		trial = i;
		order = Math.random() < 0.5 ? ['A', 'B'] : ['B', 'A'];
		draft = { r1: { depth: 4, comfort: 4 }, r2: { depth: 4, comfort: 4 }, pref: 0 };
		show(0);
	}

	function show(idx: number) {
		showing = idx;
		const k = order[idx];
		live.A!.active = k === 'A';
		live.B!.active = k === 'B';
		latest = null;
		phase = 'viewing';
		const end = performance.now() + showSeconds * 1000;
		scene ??= new ParallaxScene(canvas, setup.screen);
		const loop = () => {
			remaining = Math.max(0, (end - performance.now()) / 1000);
			if (latest) scene!.render(latest);
			if (remaining > 0) raf = requestAnimationFrame(loop);
			else if (idx === 0) show(1);
			else {
				live.A!.active = live.B!.active = false;
				phase = 'rating';
			}
		};
		loop();
	}

	function submit() {
		const [k1, k2] = order;
		results.push({
			trial: trial + 1,
			first: k1,
			ratings: { [k1]: draft.r1, [k2]: draft.r2 } as Record<'A' | 'B', Rating>,
			preferred: order[draft.pref - 1]
		});
		if (trial + 1 < trialCount) startTrial(trial + 1);
		else finish();
	}

	function finish() {
		phase = 'done';
		stopAll();
	}

	function stopAll() {
		cancelAnimationFrame(raf);
		live.A?.stop();
		live.B?.stop();
		live = {};
	}

	function csv() {
		const head = 'participant,trial,first,arm,tracker,combo,depth,comfort,preferred';
		const rows = results.flatMap((r) =>
			(['A', 'B'] as const).map((k) =>
				[
					participant,
					r.trial,
					r.first,
					k,
					arms[k].tracker,
					arms[k].combo,
					r.ratings[k].depth,
					r.ratings[k].comfort,
					r.preferred === k
				].join(',')
			)
		);
		download(`${participant || 'anon'}_blind.csv`, [head, ...rows].join('\n'), 'text/csv');
	}

	// Teardown via onMount's cleanup: onDestroy also runs during prerender.
	onMount(() => () => {
		stopAll();
		scene?.dispose();
	});

	const scale = [1, 2, 3, 4, 5, 6, 7];
</script>

<main class="min-h-screen">
	<!-- svelte-ignore a11y_media_has_caption -->
	<video bind:this={video} class="hidden" muted playsinline></video>
	<canvas bind:this={canvas} class="fixed inset-0 h-full w-full" class:hidden={phase !== 'viewing'}
	></canvas>

	{#if phase === 'viewing'}
		<div class="fixed top-4 left-4 rounded bg-black/60 px-3 py-2 text-white">
			Trial {trial + 1}/{trialCount} · Condition {showing + 1} · {remaining.toFixed(0)} s
		</div>
	{/if}

	<div class="mx-auto max-w-3xl space-y-6 p-6" class:hidden={phase === 'viewing'}>
		{#if phase === 'setup' || phase === 'loading'}
			<a class="text-sm underline" href={resolve('/bench')}>← Bench</a>
			<h1 class="text-2xl font-bold">Blind perceptual test</h1>
			<p class="text-sm text-gray-600">
				Experimenter: set this up, then hand over. The participant only sees "Condition 1/2". Sit at
				mark C during viewing and move your head freely.
			</p>
			<div class="grid gap-4 md:grid-cols-2">
				{#each ['A', 'B'] as const as k (k)}
					<fieldset class="space-y-2 rounded border p-3">
						<legend class="font-semibold">Arm {k}</legend>
						<select
							class="w-full"
							bind:value={arms[k].tracker}
							onchange={() => (arms[k].combo = combosOf(arms[k].tracker)[0])}
						>
							{#each Object.entries(TRACKERS) as [id, t] (id)}
								<option value={id}>{t.label}</option>
							{/each}
						</select>
						<select class="w-full" bind:value={arms[k].combo}>
							{#each combosOf(arms[k].tracker) as c (c)}
								<option value={c}
									>{ESTIMATORS[TRACKERS[arms[k].tracker].landmarkSet].centres.find(
										(x) => x.id === c.split('/')[0]
									)?.label} / {c.split('/')[1]}</option
								>
							{/each}
						</select>
					</fieldset>
				{/each}
			</div>
			<div class="grid grid-cols-3 gap-2">
				<label>Participant <input class="w-full" bind:value={participant} /></label>
				<label>Trials <input class="w-full" type="number" min="1" bind:value={trialCount} /></label>
				<label
					>Seconds per condition <input
						class="w-full"
						type="number"
						min="3"
						bind:value={showSeconds}
					/></label
				>
			</div>
			<SetupFields bind:setup />
			<button
				class="rounded bg-sky-600 px-4 py-2 text-white"
				disabled={phase === 'loading'}
				onclick={begin}>{phase === 'loading' ? 'Loading both arms…' : 'Begin'}</button
			>
		{:else if phase === 'calibrateC' || phase === 'calibrateR'}
			<h2 class="text-2xl font-semibold">Calibration</h2>
			<p class="text-xl">
				Sit with your eyes above mark {phase === 'calibrateC' ? 'C' : 'R'}, level with the camera,
				and hold still.
			</p>
			<button class="rounded bg-sky-600 px-4 py-2 text-white" onclick={sample}>Ready</button>
		{:else if phase === 'rating'}
			<h2 class="text-2xl font-semibold">Trial {trial + 1}: rate both conditions</h2>
			{#each [draft.r1, draft.r2] as r, i (i)}
				<fieldset class="space-y-2 rounded border p-3">
					<legend class="font-semibold">Condition {i + 1}</legend>
					<div>
						How convincingly did the scene look 3D? (1 = flat, 7 = like a real window)
						<div class="flex gap-3">
							{#each scale as v (v)}
								<label><input type="radio" bind:group={r.depth} value={v} /> {v}</label>
							{/each}
						</div>
					</div>
					<div>
						How stable / comfortable was it? (1 = jittery or laggy, 7 = solid)
						<div class="flex gap-3">
							{#each scale as v (v)}
								<label><input type="radio" bind:group={r.comfort} value={v} /> {v}</label>
							{/each}
						</div>
					</div>
				</fieldset>
			{/each}
			<div>
				Which did you prefer?
				<label class="ml-3"
					><input type="radio" bind:group={draft.pref} value={1} /> Condition 1</label
				>
				<label class="ml-3"
					><input type="radio" bind:group={draft.pref} value={2} /> Condition 2</label
				>
			</div>
			<button
				class="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-50"
				disabled={!draft.pref}
				onclick={submit}>Next</button
			>
		{:else if phase === 'done'}
			<h2 class="text-2xl font-semibold">Done, thank you</h2>
			<p>
				Preferred A in {results.filter((r) => r.preferred === 'A').length} of {results.length} trials.
			</p>
			<button class="rounded border px-3 py-1" onclick={csv}>Download CSV</button>
		{/if}
		{#if error}<p class="text-red-600">{error}</p>{/if}
	</div>
</main>
