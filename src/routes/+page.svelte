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
	let mode: 'xy' | 'zw' = $state('xy');

	function handleMouseMove(event: MouseEvent) {
		if (!canvas) {
			return;
		}
		const rect = canvas.getBoundingClientRect()
		mouse_pos = {x: event.x - rect.left, y: event.y - rect.top};
	}

	onMount(() => {
		if (!canvas) {
			return;
		}

		const scene = new THREE.Scene()
		const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
		renderer = new THREE.WebGLRenderer({ canvas })
		renderer.setSize(canvas.clientWidth, canvas.clientHeight)

		// loading scene
		{
			const loader = new GLTFLoader();

			loader.load(
				'src/lib/assets/Gallery.glb',
				(gltf) => {
					// This callback runs when the model is successfully loaded
					const model = gltf.scene;
					model.rotation.y = -Math.PI / 2;
					model.position.set(0, -1, 1)
					scene.add(model);
				},
				(xhr) => {
					// Optional: Track download progress
					console.log((xhr.loaded / xhr.total * 100) + '% loaded');
				},
				(error) => {
					// Optional: Handle errors
					console.error('An error occurred while loading the model:', error);
				}
			)
		}

		// {
		// 	const planeGeo = new THREE.PlaneGeometry(40, 40);
		// 	const planeMat = new THREE.MeshPhongMaterial({
		// 		color: 0xc4c4c4,
		// 		side: THREE.DoubleSide,
		// 	});
		// 	const plane_mesh = new THREE.Mesh(planeGeo, planeMat);
		// 	plane_mesh.rotation.x = Math.PI * -.5;
		// 	plane_mesh.position.y = -1.25;
		// 	scene.add(plane_mesh);
		// }

		{
		// 	const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
		// 	const cubeMat = new THREE.MeshPhongMaterial({color: '#8AC'});
		// 	const mesh = new THREE.Mesh(cubeGeo, cubeMat);
		// 	mesh.position.set(0, 2, 0);
		// 	scene.add(mesh);
		}

		{
			// const color = 0xFFFFFF;
			// const intensity = 1;
			// const light = new THREE.AmbientLight(color, intensity);
			// scene.add(light);
		}

		{
			const color = 0xFFFFFF;
			const intensity = 1;
			const light = new THREE.DirectionalLight(color, intensity);
			light.position.set(2, 10, 2);
			light.target.position.set(-5, 0, -2);
			scene.add(light);
			scene.add(light.target);
		}

		// overhead lights
		// const num_lights = 5  // number of lights
		// const range = 3       // horizontal space that the lights are spread across
		// for (let i=0; i<num_lights; i++) {

		// 	const x = (0.5 - (i / (num_lights - 1))) * range

		// 	const intensity = 5;
		// 	const width = 0.1;
		// 	const height = 10;

		// 	const rect_light = new THREE.RectAreaLight(0xffffff, intensity, width, height);

		// 	rect_light.position.set(x, 5, 0);
		// 	rect_light.lookAt(x, 0, 0);

		// 	scene.add(rect_light)

		// 	const rectLightHelper = new RectAreaLightHelper(rect_light);
		// 	scene.add(rectLightHelper);
		// }

		// behind light
		{
			const intensity = 2;
			const width = 10;
			const height = 10;

			const rect_light = new THREE.RectAreaLight(0xffffff, intensity, width, height);

			rect_light.position.set(0, 0, 5);
			rect_light.lookAt(0, 0, 0);

			scene.add(rect_light)

			const rectLightHelper = new RectAreaLightHelper(rect_light);
			scene.add(rectLightHelper);
		}


		// {
		// 	const icoGeo = new THREE.IcosahedronGeometry(1, 0);
		// 	const icoMat = new THREE.MeshPhongMaterial({color: '#8AC'});
		// 	const mesh = new THREE.Mesh(
		// 		icoGeo,
		// 		icoMat
		// 	)
		// 	scene.add(mesh)
		// }

		camera.position.z = 3

		// Applies a projection matrix to the camera to correct for viewing distance and angle
		// This corrects for:
		//     - keystoning -> the trapezoidal shape that the screen appears to be when viewed at an angle
		//     - perspective compression -> the effect where more distant objects approach being isometric
		function update_perspective(x: number, y: number, z:number) {
			// TODO: remove this temporary stuff
			let screen_width = 3
			let screen_height = 2

			camera.rotation.set(0, 0, 0);

			const scale = camera.near / Math.max(camera.near, z)

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
			if (!renderer || !canvas) {
				return;
			}

			if (mode == 'xy') {
				camera.position.x = (mouse_pos.x - canvas.clientWidth / 2) / 200;
				camera.position.y = -(mouse_pos.y - canvas.clientHeight / 2) / 200;
			} else if (mode == 'zw') {
				camera.position.z = 4 + (mouse_pos.x - canvas.clientWidth / 2) / 200;
			}

			// update_perspective(camera.position.x, camera.position.y, camera.position.z)

			animId = requestAnimationFrame(animate)
			// mesh.rotation.x += 0.005
			// mesh.rotation.y += 0.01
			renderer.render(scene, camera)
		}
		animate()
	})

	onDestroy(() => {
		if (animId) {
			cancelAnimationFrame(animId);
		}
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
