<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import * as THREE from 'three'
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';

	interface MousePos {
		x: number,
		y: number,
	};

	let canvas: HTMLCanvasElement | null;
	let renderer: THREE.WebGLRenderer | null;
	let animId: number | null;

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
	onMount(() => {
		// return early if canvas doesn't exist (not actually necessary, just to make TypeScript happy)
		if (!canvas) {
			return;
		}

		// initializing scene and camera
		const scene = new THREE.Scene()
		const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
		renderer = new THREE.WebGLRenderer({ canvas })
		renderer.setSize(canvas.clientWidth, canvas.clientHeight)  // TODO: update size when fullscreened, or require fullscreen from the start, or something

		// loading scene
		{
			const loader = new GLTFLoader();

			loader.load(
				'src/lib/assets/Gallery.glb',
				(gltf) => {
					// This callback runs when the model is successfully loaded
					const model = gltf.scene;

					model.rotation.y = -Math.PI / 2;  // fix model rotation
					model.position.set(0, -1, 1)      // fix model position

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

		// back light plane
		{
			const intensity = 2;
			const width = 10;
			const height = 10;

			const rect_light = new THREE.RectAreaLight(0xffffff, intensity, width, height);

			rect_light.position.set(0, 0, 5);
			rect_light.lookAt(0, 0, 0);

			scene.add(rect_light)

			const rectLightHelper = new RectAreaLightHelper(rect_light);  // this just makes the light itsself visible as a bright rectangle
			scene.add(rectLightHelper);
		}

		// TODO: set this using actual user position, rather than hard-coded test value
		// set base camera position
		camera.position.z = 4

		// Applies a projection matrix to the camera to correct for viewing distance and angle
		// This corrects for:
		//     - keystoning -> the trapezoidal shape that the screen appears to be when viewed at an angle
		//     - perspective compression -> the effect where more distant objects approach being isometric
		function update_perspective(x: number, y: number, z:number) {
			// TODO: set this stuff based on actual screen size. these are just some hard-coded values for testing purposes
			let screen_width = 3
			let screen_height = 2

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
			// return early if the renderer or canvas don't exist
			if (!renderer || !canvas) {
				return;
			}

			// TODO: animate using actual user position, rather than mouse
			// move camera
			if (mode == 'xy') {
				camera.position.x = (mouse_pos.x - canvas.clientWidth / 2) / 200;
				camera.position.y = -(mouse_pos.y - canvas.clientHeight / 2) / 200;
			} else if (mode == 'zw') {
				camera.position.z = 4 + (mouse_pos.x - canvas.clientWidth / 2) / 200;
			}

			// correct for viewer perspective
			update_perspective(camera.position.x, camera.position.y, camera.position.z)

			animId = requestAnimationFrame(animate)  // request the next frame
			renderer.render(scene, camera)  // render the current frame
		}

		animate()  // start the animation loop
	})

	// cleanup
	onDestroy(() => {
		// cancel the animation
		if (animId) {
			cancelAnimationFrame(animId);
		}

		// destroy the renderer
		renderer?.dispose();
	})
</script>

<canvas bind:this={canvas} onmousemove={handleMouseMove} onmousedown={() => {
	if (mode == 'xy') {
		mode = 'zw';
	} else if (mode == 'zw') {
		mode = 'xy';
	}
}} class="w-full h-screen block"></canvas>
