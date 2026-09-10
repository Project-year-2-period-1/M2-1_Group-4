<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import * as THREE from 'three'

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

		{
			const planeGeo = new THREE.PlaneGeometry(40, 40);
			const planeMat = new THREE.MeshPhongMaterial({
				color: 0xc4c4c4,
				side: THREE.DoubleSide,
			});
			const plane_mesh = new THREE.Mesh(planeGeo, planeMat);
			plane_mesh.rotation.x = Math.PI * -.5;
			plane_mesh.position.y = -1.25;
			scene.add(plane_mesh);
		}

		{
			const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
			const cubeMat = new THREE.MeshPhongMaterial({color: '#8AC'});
			const mesh = new THREE.Mesh(cubeGeo, cubeMat);
			mesh.position.set(0, 2, 0);
			scene.add(mesh);
		}

		{
			const color = 0xFFFFFF;
			const intensity = 1;
			const light = new THREE.AmbientLight(color, intensity);
			scene.add(light);
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

		{
			const icoGeo = new THREE.IcosahedronGeometry(1, 0);
			const icoMat = new THREE.MeshPhongMaterial({color: '#8AC'});
			const mesh = new THREE.Mesh(
				icoGeo,
				icoMat
			)
			scene.add(mesh)
		}

		camera.position.z = 3

		const animate = () => {
			if (!renderer || !canvas) {
				return;
			}

			if (mode == 'xy') {
				camera.position.x = (mouse_pos.x - canvas.clientWidth / 2) / 50;
				camera.position.y = -(mouse_pos.y - canvas.clientHeight / 2) / 50;
			} else if (mode == 'zw') {
				camera.position.z = (mouse_pos.x - canvas.clientWidth / 2) / 50;
				// camera.rotation.x = -(mouse_pos.y - canvas.clientHeight / 2) / 50;
			}

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
