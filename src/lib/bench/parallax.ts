import * as THREE from 'three';
import type { Vec3 } from './types';

export interface ScreenGeometry {
	/** Visible screen area, mm. */
	width: number;
	height: number;
	/** Camera lens position relative to the screen centre, mm (y up). Laptop: ~(0, h/2 + 8). */
	cameraOffset: { x: number; y: number };
}

/**
 * Head-coupled perspective: the screen is a window in the plane z = 0 and the virtual camera
 * sits at the viewer's eye with an off-axis frustum through the screen edges. World units
 * are mm, so a tracked position maps 1:1 and depth cues are physically consistent.
 */
export class ParallaxScene {
	readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera();

	constructor(
		canvas: HTMLCanvasElement,
		private screen: ScreenGeometry
	) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.build();
	}

	private build() {
		const { width: w, height: h } = this.screen;
		const depth = 400;
		this.scene.background = new THREE.Color(0x0b1020);
		this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
		const sun = new THREE.DirectionalLight(0xffffff, 1.2);
		sun.position.set(200, 300, 400);
		this.scene.add(sun);

		// A box "room" behind the screen: its grid lines are the strongest parallax cue.
		const grid = new THREE.LineBasicMaterial({ color: 0x3b82f6 });
		const lines: number[] = [];
		const step = 50;
		for (let z = 0; z >= -depth; z -= step) {
			lines.push(-w / 2, -h / 2, z, w / 2, -h / 2, z, w / 2, -h / 2, z, w / 2, h / 2, z);
			lines.push(w / 2, h / 2, z, -w / 2, h / 2, z, -w / 2, h / 2, z, -w / 2, -h / 2, z);
		}
		for (let x = -w / 2; x <= w / 2 + 1e-6; x += w / 6) {
			lines.push(x, -h / 2, 0, x, -h / 2, -depth, x, h / 2, 0, x, h / 2, -depth);
		}
		for (let y = -h / 2; y <= h / 2 + 1e-6; y += h / 4) {
			lines.push(-w / 2, y, 0, -w / 2, y, -depth, w / 2, y, 0, w / 2, y, -depth);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
		this.scene.add(new THREE.LineSegments(geo, grid));

		// Objects at several depths, one in front of the screen plane.
		const objects: [number, number, number, number, number][] = [
			[-w * 0.25, -h * 0.2, -300, 30, 0xf97316],
			[w * 0.2, -h * 0.1, -150, 25, 0x22c55e],
			[0, h * 0.15, -50, 20, 0xeab308],
			[-w * 0.05, -h * 0.25, 40, 15, 0xec4899]
		];
		for (const [x, y, z, r, color] of objects) {
			const m = new THREE.Mesh(
				new THREE.SphereGeometry(r, 32, 16),
				new THREE.MeshStandardMaterial({ color })
			);
			m.position.set(x, y, z);
			this.scene.add(m);
			// Stalk to the floor so depth is readable even without motion.
			const stalk = new THREE.Mesh(
				new THREE.CylinderGeometry(1.5, 1.5, y + h / 2),
				new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
			);
			stalk.position.set(x, (y - h / 2) / 2, z);
			this.scene.add(stalk);
		}
	}

	/** eye: tracked position in camera space (mm, x right, y up, z towards viewer). */
	render(eye: Vec3) {
		const canvas = this.renderer.domElement;
		this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
		const { width: w, height: h, cameraOffset } = this.screen;
		// Camera space -> screen space (origin at screen centre).
		const e = { x: eye.x + cameraOffset.x, y: eye.y + cameraOffset.y, z: Math.max(eye.z, 50) };
		const near = 10;
		const k = near / e.z;
		this.camera.position.set(e.x, e.y, e.z);
		this.camera.projectionMatrix.makePerspective(
			(-w / 2 - e.x) * k,
			(w / 2 - e.x) * k,
			(h / 2 - e.y) * k,
			(-h / 2 - e.y) * k,
			near,
			5000
		);
		this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
		this.renderer.render(this.scene, this.camera);
	}

	dispose() {
		this.renderer.dispose();
	}
}
