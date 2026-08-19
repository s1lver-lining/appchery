/**
 * Records how the phone was held, one sample per video frame.
 *
 * Nothing reads this yet. It is captured because it is free to capture and impossible to add later:
 * the recordings already made have no motion in them, and the ones made from now on will.
 *
 * What it can settle is orientation, not place. Gravity tells the phone which way is down at all
 * times and without drift, which is the tilt of the face in the picture, and that is the one thing
 * the fit cannot see when the face is nearly round. Turn rate tells it how fast the view is changing,
 * which is what separates two genuinely different looks at a boss from the same look taken twice.
 *
 * What it cannot settle is where the archer is standing. Acceleration integrated twice drifts to
 * metres within seconds, so it will never say how far from the boss the camera is.
 */
export interface MotionSample {
	/** Milliseconds since recording began, so a sample can be paired with a frame. */
	at: number;
	/** Gravity in the phone's own axes, which fixes which way up it is being held. */
	gravity: { x: number; y: number; z: number } | null;
	/** Turn rate about each of the phone's axes, degrees per second. */
	turn: { alpha: number; beta: number; gamma: number } | null;
	/** Compass and tilt as the browser reports them, when it will. */
	heading: { alpha: number; beta: number; gamma: number } | null;
}

/**
 * Collects motion while a session records. Samples arrive as fast as the device offers them, which is
 * faster than the camera, so the newest is simply kept and read once per frame.
 */
export class MotionLog {
	private samples: MotionSample[] = [];
	private latest: Omit<MotionSample, 'at'> = { gravity: null, turn: null, heading: null };
	private started = 0;
	private listening = false;

	private readonly onMotion = (event: DeviceMotionEvent) => {
		const gravity = event.accelerationIncludingGravity;
		if (gravity && gravity.x !== null) {
			this.latest.gravity = { x: gravity.x ?? 0, y: gravity.y ?? 0, z: gravity.z ?? 0 };
		}
		const turn = event.rotationRate;
		if (turn && turn.alpha !== null) {
			this.latest.turn = { alpha: turn.alpha ?? 0, beta: turn.beta ?? 0, gamma: turn.gamma ?? 0 };
		}
	};

	private readonly onOrientation = (event: DeviceOrientationEvent) => {
		if (event.alpha === null && event.beta === null && event.gamma === null) return;
		this.latest.heading = { alpha: event.alpha ?? 0, beta: event.beta ?? 0, gamma: event.gamma ?? 0 };
	};

	/** Starts listening. Silently does nothing where the device has no such sensors, which is a laptop. */
	start(now = performance.now()) {
		if (this.listening || typeof window === 'undefined') return;
		this.started = now;
		this.samples = [];
		window.addEventListener('devicemotion', this.onMotion);
		window.addEventListener('deviceorientation', this.onOrientation);
		this.listening = true;
	}

	/** Takes one sample, meant to be called once per frame so each frame has exactly one. */
	sample(now = performance.now()) {
		if (!this.listening) return;
		this.samples.push({
			at: Math.round(now - this.started),
			gravity: this.latest.gravity ? { ...this.latest.gravity } : null,
			turn: this.latest.turn ? { ...this.latest.turn } : null,
			heading: this.latest.heading ? { ...this.latest.heading } : null
		});
	}

	stop() {
		if (!this.listening) return;
		window.removeEventListener('devicemotion', this.onMotion);
		window.removeEventListener('deviceorientation', this.onOrientation);
		this.listening = false;
	}

	/** True once anything was actually recorded, so an empty file is never written beside a video. */
	get any(): boolean {
		return this.samples.some((s) => s.gravity || s.turn || s.heading);
	}

	get count(): number {
		return this.samples.length;
	}

	toJSON(): string {
		return JSON.stringify({ samples: this.samples });
	}
}

/**
 * Asks for the sensors where the browser requires it, which is Safari on iOS. Everywhere else the
 * events simply arrive, and a refusal here only means the recording carries no motion.
 */
export async function allowMotion(): Promise<boolean> {
	const motion = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
	if (typeof motion?.requestPermission !== 'function') return true;
	try {
		return (await motion.requestPermission()) === 'granted';
	} catch {
		return false;
	}
}
