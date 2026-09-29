<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { analyse, type SessionResult } from '$lib/bench/analysis';
	import { CRITERIA, compareArms, type ArmSummary } from '$lib/bench/criteria';
	import { DEFAULT_ONE_EURO } from '$lib/bench/oneEuro';
	import {
		DEFAULT_MARKS,
		PROTOCOL,
		looksLikeCm,
		buildTimeline,
		type Segment,
		type SessionMeta
	} from '$lib/bench/protocol';
	import {
		CAMERA,
		download,
		recordingExtension,
		runSession,
		startRecording,
		toCsv,
		type RunHandle,
		type Sidecar
	} from '$lib/bench/session';
	import SetupDiagram from '$lib/bench/SetupDiagram.svelte';
	import { TRACKERS, createTracker, type TrackerId } from '$lib/bench/trackers';
	import type { FrameRecord, Tracker, Vec2 } from '$lib/bench/types';

	let trackerId: TrackerId = $state('mediapipe');
	let mode: 'live' | 'replay' = $state('live');
	let meta: SessionMeta = $state({
		participant: '',
		lighting: 'normal',
		glasses: false,
		machine: '',
		notes: '',
		marks: { ...DEFAULT_MARKS },
		recordedAt: ''
	});
	let playbackRate = $state(0.25);
	let replayVideo: File | null = $state(null);
	let replaySidecar: File | null = $state(null);

	let status: 'idle' | 'loading' | 'running' | 'done' | 'error' = $state('idle');
	let error = $state('');
	let prompt = $state('');
	let countdown = $state('');
	let phase: 'move' | 'hold' | 'act' | 'done' = $state('move');
	let stepLabel = $state('');
	let result: SessionResult | null = $state(null);
	let records: FrameRecord[] = [];
	let recording: Blob | null = $state(null);
	let sidecar: Sidecar | null = null;

	let video: HTMLVideoElement;
	let overlay: HTMLCanvasElement;
	let tracker: Tracker | null = null;
	let stream: MediaStream | null = null;
	let run: RunHandle | null = null;
	let promptFrame = 0;
	let stage: HTMLElement;

	const steps = new Map(PROTOCOL.map((s) => [s.id, s]));
	const baseName = () =>
		[meta.participant || 'anon', meta.lighting, meta.glasses ? 'glasses' : 'noglasses'].join('_');

	function drawLandmarks(pts: Vec2[] | null) {
		const ctx = overlay.getContext('2d')!;
		overlay.width = video.videoWidth;
		overlay.height = video.videoHeight;
		ctx.clearRect(0, 0, overlay.width, overlay.height);
		if (!pts) return;
		ctx.fillStyle = '#22d3ee';
		for (const p of pts) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
	}

	/** Shows the current instruction, driven by the session clock. */
	function showPrompts(timeline: Segment[], clock: () => number) {
		const tick = () => {
			const t = clock();
			const current = timeline.find((s) => t >= s.startMs && t < s.endMs);
			const next = timeline.find((s) => s.startMs > t);
			const seg = current ?? next;
			if (seg) {
				const step = steps.get(seg.stepId)!;
				prompt = step.instruction;
				stepLabel = `Step ${timeline.indexOf(seg) + 1} of ${timeline.length}`;
				if (current) {
					phase = step.kind === 'calibration' || step.kind === 'static' ? 'hold' : 'act';
					countdown = `${((current.endMs - t) / 1000).toFixed(1)} s left`;
				} else {
					phase = 'move';
					countdown = `recording starts in ${((seg.startMs - t) / 1000).toFixed(1)} s`;
				}
			} else {
				phase = 'done';
				prompt = 'Done';
				countdown = '';
				stepLabel = '';
			}
			promptFrame = requestAnimationFrame(tick);
		};
		tick();
	}

	async function start() {
		status = 'loading';
		error = '';
		result = null;
		recording = null;
		try {
			tracker = await createTracker(trackerId);
			await tracker.init();

			let timeline: Segment[];
			let recorder: ReturnType<typeof startRecording> | null = null;
			if (mode === 'live') {
				stream = await navigator.mediaDevices.getUserMedia(CAMERA);
				video.srcObject = stream;
				await video.play();
				timeline = buildTimeline();
				meta.recordedAt = new Date().toISOString();
				sidecar = { version: 1, meta: $state.snapshot(meta), timeline };
				recorder = startRecording(stream);
			} else {
				if (!replayVideo || !replaySidecar) throw new Error('Pick a recording and its sidecar');
				sidecar = JSON.parse(await replaySidecar.text()) as Sidecar;
				meta = sidecar.meta;
				timeline = sidecar.timeline;
				video.srcObject = null;
				video.src = URL.createObjectURL(replayVideo);
				video.playbackRate = playbackRate;
				await video.play();
			}

			status = 'running';
			await tick();
			stage.scrollIntoView({ block: 'start' });
			run = runSession({
				tracker,
				video,
				timeline,
				mode,
				onFrame: (_r, frame) => drawLandmarks(frame.landmarks)
			});
			showPrompts(timeline, () =>
				mode === 'live' ? performance.now() - run!.startedAt : video.currentTime * 1000
			);

			const out = await run.done;
			records = out.records;
			if (recorder) recording = await recorder.stop();
			const { stats, combos } = analyse(records, tracker.landmarkSet, meta.marks);
			result = {
				tracker: tracker.id,
				landmarkSet: tracker.landmarkSet,
				meta: $state.snapshot(meta),
				source: mode,
				droppedFrames: out.droppedFrames,
				stats,
				combos,
				filter: DEFAULT_ONE_EURO
			};
			status = 'done';
		} catch (e) {
			error = (e as Error).message;
			status = 'error';
		} finally {
			cleanup();
		}
	}

	function cleanup() {
		cancelAnimationFrame(promptFrame);
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		video?.pause();
		tracker?.dispose();
		tracker = null;
	}

	function abort() {
		run?.stop();
	}

	// Teardown via onMount's cleanup: onDestroy also runs during prerender.
	onMount(() => () => {
		run?.stop();
		cleanup();
	});

	let compared: ArmSummary[] = $state([]);
	async function loadResults(files: FileList | null) {
		if (!files) return;
		const all = await Promise.all([...files].map(async (f) => JSON.parse(await f.text())));
		compared = compareArms(all as SessionResult[]);
	}

	const fmt = (v: number | null | undefined, d = 1) =>
		v == null || !Number.isFinite(v) ? '—' : v.toFixed(d);
	const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
</script>

<main class="mx-auto max-w-6xl space-y-8 p-6">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-bold">Tracker bench</h1>
		<nav class="space-x-4 text-sm underline">
			<a href={resolve('/bench/live')}>Live (real head)</a>
			<a href={resolve('/bench/blind')}>Blind perceptual test</a>
		</nav>
	</header>

	{#if CRITERIA.agreedOn === null}
		<p class="rounded bg-amber-100 p-3 text-sm text-amber-900">
			Criteria in <code>src/lib/bench/criteria.ts</code> are not marked as agreed. Agree and commit them
			before collecting data you intend to decide on.
		</p>
	{/if}

	<details class="rounded border p-3 text-sm" open>
		<summary class="cursor-pointer font-semibold">How to set up (read once)</summary>
		<div class="mt-2 space-y-2">
			<SetupDiagram dx={meta.marks.dx} />
			<p>
				The test checks the trackers against positions you have measured. Distances are from the
				webcam to the point between your eyes.
			</p>
			<ol class="list-decimal space-y-1 pl-5">
				<li>
					<b>Sideways tape:</b> put a small piece of tape on the front edge of your desk straight
					below the webcam (centre), and one {meta.marks.dx / 10} cm to each side (L and R). "At R" means
					sitting normally with your nose in line with the R tape. Slide or lean sideways; glance down
					to check.
				</li>
				<li>
					<b>Three poses, measured once:</b> <b>C</b> = sitting normally, <b>N</b> = leaning in
					towards the screen, <b>F</b> = leaning back. Pick poses you can repeat (e.g. N = forearms on
					the desk, F = back against the chair). For each, hold one end of a tape measure at the webcam
					and read the distance to between your eyes (a mirror or a helper makes this easier). Type the
					three numbers into "Positions".
				</li>
				<li>
					<b>Run:</b> press Start and follow the big instruction. While it says "get in position", move;
					while it says "recording", stay put (or do the action). About 2½ minutes, no clicking.
				</li>
			</ol>
		</div>
	</details>

	<section class="grid gap-4 md:grid-cols-3">
		<fieldset class="space-y-2" disabled={status === 'running' || status === 'loading'}>
			<legend class="font-semibold">Run</legend>
			<label class="block"
				>Tracker
				<select class="w-full" bind:value={trackerId}>
					{#each Object.entries(TRACKERS) as [id, t] (id)}
						<option value={id}>{t.label}</option>
					{/each}
				</select>
			</label>
			<label class="block"
				>Source
				<select class="w-full" bind:value={mode}>
					<option value="live">Live webcam (records for replay)</option>
					<option value="replay">Replay a recording</option>
				</select>
			</label>
			{#if mode === 'replay'}
				<label class="block"
					>Recording (.webm / .mp4)
					<input
						type="file"
						accept="video/*"
						onchange={(e) => (replayVideo = e.currentTarget.files?.[0] ?? null)}
					/>
				</label>
				<label class="block"
					>Sidecar (.json)
					<input
						type="file"
						accept="application/json"
						onchange={(e) => (replaySidecar = e.currentTarget.files?.[0] ?? null)}
					/>
				</label>
				<label class="block"
					>Playback rate (lower = no dropped frames)
					<input
						class="w-full"
						type="number"
						step="0.05"
						min="0.05"
						max="1"
						bind:value={playbackRate}
					/>
				</label>
			{/if}
		</fieldset>

		<fieldset class="space-y-2" disabled={mode === 'replay' || status === 'running'}>
			<legend class="font-semibold">Session (saved in the sidecar)</legend>
			<label class="block">Participant <input class="w-full" bind:value={meta.participant} /></label
			>
			<label class="block">Machine <input class="w-full" bind:value={meta.machine} /></label>
			<label class="block"
				>Lighting
				<select class="w-full" bind:value={meta.lighting}>
					<option value="normal">Normal</option>
					<option value="dim">Dim</option>
					<option value="backlit">Backlit</option>
				</select>
			</label>
			<label class="flex items-center gap-2"
				><input type="checkbox" bind:checked={meta.glasses} /> Glasses</label
			>
			<label class="block">Notes <input class="w-full" bind:value={meta.notes} /></label>
		</fieldset>

		<fieldset class="space-y-2" disabled={mode === 'replay' || status === 'running'}>
			<legend class="font-semibold">Positions (mm, webcam to between your eyes)</legend>
			{#if looksLikeCm(meta.marks)}
				<p class="font-semibold text-red-600">
					These look like centimetres. Enter millimetres: 38 cm is 380.
				</p>
			{/if}
			{#if meta.marks.z0 === DEFAULT_MARKS.z0 && meta.marks.zNear === DEFAULT_MARKS.zNear && meta.marks.zFar === DEFAULT_MARKS.zFar}
				<p class="text-amber-700">
					These are the example values. Measure your own poses, or the accuracy results will be
					wrong.
				</p>
			{/if}
			<label class="block"
				>C: sitting normally <input
					class="w-full"
					type="number"
					bind:value={meta.marks.z0}
				/></label
			>
			<label class="block"
				>N: leaning in <input class="w-full" type="number" bind:value={meta.marks.zNear} /></label
			>
			<label class="block"
				>F: leaning back <input class="w-full" type="number" bind:value={meta.marks.zFar} /></label
			>
			<label class="block"
				>L/R tape: distance from centre tape <input
					class="w-full"
					type="number"
					bind:value={meta.marks.dx}
				/></label
			>
		</fieldset>
	</section>

	<div class="flex gap-3">
		<button
			class="rounded bg-sky-600 px-4 py-2 text-white disabled:opacity-50"
			disabled={status === 'running' || status === 'loading'}
			onclick={start}>{status === 'loading' ? 'Loading…' : 'Start'}</button
		>
		{#if status === 'running'}
			<button class="rounded bg-red-600 px-4 py-2 text-white" onclick={abort}>Stop</button>
		{/if}
	</div>
	{#if error}<p class="text-red-600">{error}</p>{/if}

	<section bind:this={stage} class="grid gap-4 md:grid-cols-2" class:hidden={status !== 'running'}>
		<!-- On phones: instructions first, smaller preview, so both fit on screen. -->
		<div class="relative mx-auto w-1/2 -scale-x-100 md:w-full">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} class="w-full" muted playsinline></video>
			<canvas bind:this={overlay} class="absolute inset-0 h-full w-full"></canvas>
		</div>
		<div class="order-first flex flex-col justify-center gap-4 md:order-none">
			<p class="text-sm text-gray-500">{stepLabel}</p>
			<p
				class={[
					'rounded px-4 py-2 text-2xl font-bold text-white',
					phase === 'move' && 'bg-amber-500',
					phase === 'hold' && 'bg-green-600',
					phase === 'act' && 'bg-sky-600',
					phase === 'done' && 'bg-gray-500'
				]}
			>
				{phase === 'move'
					? 'MOVE NOW: get there and settle'
					: phase === 'hold'
						? 'RECORDING: hold still'
						: phase === 'act'
							? 'RECORDING: do this now'
							: 'Finished'}
			</p>
			<p class="text-3xl font-semibold">{prompt}</p>
			<p class="text-xl text-gray-500">{countdown}</p>
		</div>
	</section>

	{#if result}
		<section class="space-y-4">
			<h2 class="text-xl font-semibold">Result: {result.tracker} ({result.source})</h2>
			<div class="flex flex-wrap gap-3">
				<button
					class="rounded border px-3 py-1"
					onclick={() =>
						download(
							`${baseName()}_${result!.tracker}.result.json`,
							JSON.stringify(result, null, '\t'),
							'application/json'
						)}>Result JSON</button
				>
				<button
					class="rounded border px-3 py-1"
					onclick={() =>
						download(
							`${baseName()}_${result!.tracker}.frames.csv`,
							toCsv(records, meta, result!.tracker),
							'text/csv'
						)}>Frames CSV</button
				>
				{#if recording}
					<button
						class="rounded border px-3 py-1"
						onclick={() => download(`${baseName()}.${recordingExtension(recording!)}`, recording!)}
						>Recording</button
					>
					<button
						class="rounded border px-3 py-1"
						onclick={() =>
							download(
								`${baseName()}.sidecar.json`,
								JSON.stringify(sidecar, null, '\t'),
								'application/json'
							)}>Sidecar</button
					>
				{/if}
			</div>

			<dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
				<dt>Frames</dt>
				<dd>{result.stats.frames} (dropped {result.droppedFrames})</dd>
				<dt>FPS</dt>
				<dd>{fmt(result.stats.fps)}</dd>
				<dt>Processing p50 / p95 ms</dt>
				<dd>{fmt(result.stats.procP50)} / {fmt(result.stats.procP95)}</dd>
				<dt>Capture→result p50 ms</dt>
				<dd>{fmt(result.stats.captureToResultP50)}</dd>
				<dt>Detection (normal view)</dt>
				<dd>{pct(result.stats.detectionRateNormal)}</dd>
				<dt>Detection (occluded)</dt>
				<dd>{pct(result.stats.occlusionDetectionRate)}</dd>
				<dt>Recovery after absence ms</dt>
				<dd>{fmt(result.stats.recoveryMs, 0)}</dd>
			</dl>

			<h3 class="font-semibold">Estimators (suite 2), sorted by filtered static jitter</h3>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="text-left">
							<th>Centre / size</th><th>Jitter raw mm</th><th>Jitter filtered mm</th><th
								>Accuracy mm</th
							>
							<th>Expression drift mm</th><th>Rotation coupling mm</th><th>Filter lag ms</th><th
							></th>
						</tr>
					</thead>
					<tbody>
						{#each [...result.combos].sort((a, b) => (a.staticJitterFiltered || Infinity) - (b.staticJitterFiltered || Infinity)) as c (c.combo)}
							<tr class="border-t">
								<td>{c.combo}</td>
								<td>{fmt(c.staticJitterRaw, 2)}</td>
								<td>{fmt(c.staticJitterFiltered, 2)}</td>
								<td>{fmt(c.accuracyMm)}</td>
								<td>{fmt(c.expressionDriftMm, 2)}</td>
								<td>{fmt(c.rotationCouplingMm, 2)}</td>
								<td>{fmt(c.filterLagMs, 0)}</td>
								<td class="text-red-600">{c.failure ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<section class="space-y-3 border-t pt-6">
		<h2 class="text-xl font-semibold">Compare arms (suite 1)</h2>
		<p class="text-sm text-gray-600">
			Load result JSONs from every participant × condition × tracker. Metrics are medians across
			sessions; each arm is judged on its lowest-jitter estimator.
		</p>
		<input
			type="file"
			accept="application/json"
			multiple
			onchange={(e) => loadResults(e.currentTarget.files)}
		/>
		{#if compared.length}
			<table class="w-full text-sm">
				<thead>
					<tr class="text-left"
						><th>Arm</th><th>Sessions</th><th>Estimator</th><th>Gates</th><th>Score</th></tr
					>
				</thead>
				<tbody>
					{#each compared as a (a.tracker)}
						<tr class="border-t align-top">
							<td>{a.tracker}</td>
							<td>{a.sessions}</td>
							<td>{a.bestCombo}</td>
							<td>
								{#each a.gates as g (g.name)}
									<div class={g.pass ? 'text-green-700' : 'text-red-600'}>
										{g.pass ? '✓' : '✗'}
										{g.name}
										{g.limit}: {fmt(g.value, 2)}
									</div>
								{/each}
							</td>
							<td>{a.gates.every((g) => g.pass) ? a.score.toFixed(3) : 'eliminated'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{@const { minSessionsPerArm, tieMargin } = CRITERIA.decision}
			{@const passing = compared.filter((a) => a.gates.every((g) => g.pass))}
			{#if compared.some((a) => a.sessions < minSessionsPerArm)}
				<p class="text-amber-700">
					Not enough data yet: every arm needs at least {minSessionsPerArm} sessions.
				</p>
			{:else if passing.length >= 2 && passing[0].score - passing[1].score < tieMargin}
				<p class="text-amber-700">
					Tie (scores within {tieMargin}): decide by the blind test majority preference.
				</p>
			{:else if passing.length}
				<p class="font-semibold">Winner: {passing[0].tracker}</p>
			{:else}
				<p class="text-red-600">No arm passes every gate: see which gate failed.</p>
			{/if}
		{/if}
	</section>
</main>
