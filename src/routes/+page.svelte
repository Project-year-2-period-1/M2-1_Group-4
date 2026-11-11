<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import Stats from 'stats.js';
	import * as THREE from 'three/webgpu'
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
	import { HeadTracker, type HeadTrackerStatus } from '$lib/tracking/headTracker';

	// TODO: remove this eventually (or combine it with other mouse related stuff just for testing, to keep it organized)
	interface MousePos {
		x: number,
		y: number,
	};

	let canvas: HTMLCanvasElement | null;
	let renderer: THREE.WebGPURenderer | null;
	let animId: number | null;

	// webcam head tracking (MediaPipe). Falls back to the mouse if the camera can't be used.
	let video: HTMLVideoElement;
	let head: HeadTracker | null = null;
	let headStatus: HeadTrackerStatus = $state({ state: 'loading' });

	// TODO: change this to have the "window" be at a set virtual position, and relate real-world distances to virtual units
	// camera distance (world units) the scene is composed for. The viewer's measured starting
	// distance is mapped onto this, so the scene looks as designed from wherever they sit.
	const BASE_CAMERA_Z = 4;

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'c') {
			head?.recalibrate();
		}
	}

	let mouse_pos: MousePos = $state({x: 0, y: 0})
	let mode: 'xy' | 'zw' = $state('xy');  // TODO: remove `mode` stuff, it's just for testing. use actual user position instead

	// TODO: remove this function when switching to using actual user position (unless we still want to use mouse position for something)
	function handleMouseMove(event: MouseEvent) {
		if (!canvas) {
			return;
		}
		const rect = canvas.getBoundingClientRect()
		mouse_pos = {x: event.x - rect.left, y: event.y - rect.top};
	}

	// TODO: add fps counter for testing and comparing
	onMount(async () => {
		// return early if canvas doesn't exist (not actually necessary, just to make TypeScript happy)
		if (!canvas) {
			return;
		}

		// initialize Stats.js stuff (for the fps counter)
		const stats = new Stats();
		stats.showPanel(0); // 0: fps, 1: ms, 2: mb

		stats.dom.style.position = 'absolute';
		stats.dom.style.top = '0px';
		stats.dom.style.left = '0px';
		document.body.appendChild(stats.dom);


		// initializing scene and camera
		const scene = new THREE.Scene()
		const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
		renderer = new THREE.WebGPURenderer({ canvas })
		renderer.setSize(canvas.clientWidth, canvas.clientHeight)  // TODO: update size when fullscreened, or require fullscreen from the start, or something

		await renderer.init();

		// loading scene
		{
			const loader = new GLTFLoader();

			loader.load(
				'src/lib/assets/Windmill.glb',  // TODO: i dont know if this path will work in production
				(gltf) => {
					// This callback runs when the model is successfully loaded
					const model = gltf.scene;

					model.rotation.y = -Math.PI / 2;  // fix model rotation
					model.position.set(0, -1, -25)      // fix model position

					scene.add(model);
				},
				(xhr) => {
					// Track download progress
					console.log((xhr.loaded / xhr.total * 100) + '% loaded');
				},
				(error) => {
					// Handle errors
					console.error('An error occurred while loading the model:', error);
				}
			)
		}

		// scene background (sky and such)
		{
			scene.background = new THREE.Color(0xb0cdff);
		}

		// directional light
		{
			const color = 0xFFFFFF;
			const intensity = 1;
			const light = new THREE.DirectionalLight(color, intensity);
			light.position.set(2, 10, 2);
			light.target.position.set(-5, 0, -2);
			scene.add(light);
			scene.add(light.target);
		}

// 		// back light plane
// 		{
// 			const intensity = 2;
// 			const width = 10;
// 			const height = 10;
//
// 			const rect_light = new THREE.RectAreaLight(0xffffff, intensity, width, height);
//
// 			rect_light.position.set(0, 0, 5);
// 			rect_light.lookAt(0, 0, 0);
//
// 			scene.add(rect_light)
//
// 			const rectLightHelper = new RectAreaLightHelper(rect_light);  // this just makes the light itsself visible as a bright rectangle
// 			scene.add(rectLightHelper);
// 		}

		// start head tracking (not awaited: the scene renders with the mouse until it's ready)
		head = new HeadTracker(video, (s) => (headStatus = s));
		head.start();

		// base camera position, until the viewer's starting distance has been measured
		camera.position.z = BASE_CAMERA_Z

		// Applies a projection matrix to the camera to correct for viewing distance and angle
		// This corrects for:
		//     - keystoning -> the trapezoidal shape that the screen appears to be when viewed at an angle
		//     - perspective compression -> the effect where more distant objects approach being isometric
		//TODO: hardcoded values only used under one case, still need to be eventually resolved
		function update_perspective(x: number, y: number, z:number, screen_width = 3, screen_height = 2) {

			camera.rotation.set(0, 0, 0);  // ensure camera is facing forward (this is needed to make the projection matrix work properly)

			const scale = camera.near / Math.max(camera.near, z)  // scale based on distance (max is used to prevent dividing by zero)

			// calculating frustum bounds for the screen plane (scaled to the near plane)
			const left   = (-screen_width  / 2 - x) * scale
			const right  = ( screen_width  / 2 - x) * scale
			const top    = ( screen_height / 2 - y) * scale
			const bottom = (-screen_height / 2 - y) * scale

			// apply the projection matrix
			camera.projectionMatrix.makePerspective(left, right, top, bottom, camera.near, camera.far)
		    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();  // TODO: is this needed?
		}

		const animate = () => {
			stats.begin()  // start tracking frame time

			console.log("hihi")

			// return early if the renderer or canvas don't exist
			if (!renderer || !canvas) {
				return;
			}

			console.log("hihi 2")



			// move camera
			if (head?.position && head.baselineDistance) {
				// head position is in mm relative to the screen centre; one uniform scale keeps
				// sideways and depth movement in proportion, so parallax stays physically consistent
				const scale = BASE_CAMERA_Z / head.baselineDistance;  // world units per mm
				camera.position.set(head.position.x * scale, head.position.y * scale, head.position.z * scale);
				update_perspective(
					camera.position.x, camera.position.y, camera.position.z,
					head.screen.width * scale, head.screen.height * scale
				)
			} else {
				// fallback (no camera / still measuring): mouse position
				if (mode == 'xy') {
					camera.position.x = (mouse_pos.x - canvas.clientWidth / 2) / 200;
					camera.position.y = -(mouse_pos.y - canvas.clientHeight / 2) / 200;
				} else if (mode == 'zw') {
					camera.position.z = BASE_CAMERA_Z + (mouse_pos.x - canvas.clientWidth / 2) / 200;
				}

				// correct for viewer perspective
				update_perspective(camera.position.x, camera.position.y, camera.position.z)
			}

			stats.end()  // stop tracking frame time

			renderer.render(scene, camera)  // render the current frame

			console.log("hihi 3")
		}

		// start animation loop
		renderer.setAnimationLoop(animate);
	})

	// cleanup
	onDestroy(() => {
		// cancel the animation
		renderer?.setAnimationLoop(null);

		// destroy the renderer
		renderer?.dispose();

		// release the webcam
		head?.stop();
	})
</script>

<canvas bind:this={canvas} onmousemove={handleMouseMove} onmousedown={() => {
	if (mode == 'xy') {
		mode = 'zw';
	} else if (mode == 'zw') {
		mode = 'xy';
	}
}} class="w-full h-screen block"></canvas>

<svelte:window onkeydown={handleKeyDown} />

<!-- small mirrored webcam preview + tracking status -->
<div class="pointer-events-none fixed right-2 bottom-2 flex flex-col items-end gap-1 text-xs text-white">
	<video bind:this={video} muted playsinline class="w-40 -scale-x-100 rounded opacity-70"></video>
	<p class="rounded bg-black/60 px-2 py-1">
		{#if headStatus.state === 'loading'}
			Starting webcam…
		{:else if headStatus.state === 'measuring'}
			Sit normally and look at the screen: measuring your distance…
		{:else if headStatus.state === 'tracking'}
			Start distance {Math.round(headStatus.baselineDistance / 10)} cm · press C to re-measure
		{:else}
			Head tracking unavailable ({headStatus.message}), using the mouse
		{/if}
	</p>
</div>
