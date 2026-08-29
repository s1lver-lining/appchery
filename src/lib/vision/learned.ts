import { cropToImage, toFaceCoords } from './face';
import type { Frame, FaceLocation } from './types';

/**
 * The learned arrow detector: a small convolutional network run over a rectified crop of the face.
 *
 * It never looks for the target. The classical face detector locates and rectifies it, and this is
 * handed a square crop in face coordinates, gold centred and radius normalised, so scale, rotation and
 * position are gone before the network sees anything. That is what makes a few hundred training
 * photographs enough to try, and it means a prediction is already a point that scores.
 *
 * The forward pass is written out here rather than run on an inference runtime. The whole network is
 * about a hundred thousand weights, six convolutions and a head, so a runtime would be far larger than
 * the model it loaded, and this keeps the app local first with nothing extra to ship.
 */

export interface ArrowModel {
	/** Side of the input crop in pixels. */
	size: number;
	/** Side of the output grid. */
	grid: number;
	/** How far past the face edge the crop reaches, in face radii. */
	span: number;
	/** Confidence a peak needs to be reported. */
	threshold: number;
	layers: Layer[];
}

interface Layer {
	in: number;
	out: number;
	stride: number;
	dilation: number;
	/** 3 unless stated, the head being the one 1x1. */
	kernel?: number;
	relu: boolean;
	weight: number[];
	bias: number[];
}

export interface LearnedArrow {
	/** Impact in face coordinates, the space the scoring rules use. */
	x: number;
	y: number;
	/** The same point in the frame's pixels, for drawing. */
	imageX: number;
	imageY: number;
	confidence: number;
}

/** A plane of activations, kept flat with channels outermost so a convolution reads them in order. */
interface Tensor {
	channels: number;
	width: number;
	height: number;
	data: Float32Array;
}

/**
 * Samples the face into a square crop, nearest neighbour, the same way the training data was made.
 * Any disagreement here is a disagreement between what the model learnt and what it is shown.
 */
function rectify(frame: Frame, face: FaceLocation, size: number, span: number): Tensor {
	const data = new Float32Array(3 * size * size);
	const plane = size * size;

	for (let j = 0; j < size; j++) {
		for (let i = 0; i < size; i++) {
			const fx = ((i + 0.5) / size) * 2 * span - span;
			const fy = ((j + 0.5) / size) * 2 * span - span;
			const sample = cropToImage(face, fx, fy);
			const x = Math.round(sample.x);
			const y = Math.round(sample.y);
			const at = j * size + i;
			if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
				/**
				 * Off the edge of the picture reads as black, because that is what the training crops
				 * hold there. Leaving it at zero instead put mid grey outside the frame, a colour the
				 * model never saw at the edges of anything it learnt from.
				 */
				data[at] = -1;
				data[plane + at] = -1;
				data[2 * plane + at] = -1;
				continue;
			}

			const p = (y * frame.width + x) * 4;
			// Scaled to the range the network was trained on.
			data[at] = (frame.data[p] / 255) * 2 - 1;
			data[plane + at] = (frame.data[p + 1] / 255) * 2 - 1;
			data[2 * plane + at] = (frame.data[p + 2] / 255) * 2 - 1;
		}
	}
	return { channels: 3, width: size, height: size, data };
}

/** One convolution with its bias already folded in, padded to keep the size the stride implies. */
function convolve(input: Tensor, layer: Layer): Tensor {
	const kernel = layer.kernel ?? 3;
	const pad = kernel === 1 ? 0 : layer.dilation;
	const width = Math.floor((input.width + 2 * pad - layer.dilation * (kernel - 1) - 1) / layer.stride) + 1;
	const height = Math.floor((input.height + 2 * pad - layer.dilation * (kernel - 1) - 1) / layer.stride) + 1;
	const out = new Float32Array(layer.out * width * height);

	const inPlane = input.width * input.height;
	const outPlane = width * height;

	for (let o = 0; o < layer.out; o++) {
		const bias = layer.bias[o];
		const outBase = o * outPlane;
		for (let j = 0; j < height; j++) {
			for (let i = 0; i < width; i++) {
				let sum = bias;
				for (let c = 0; c < layer.in; c++) {
					const inBase = c * inPlane;
					const weightBase = ((o * layer.in + c) * kernel) * kernel;
					for (let kj = 0; kj < kernel; kj++) {
						const y = j * layer.stride - pad + kj * layer.dilation;
						if (y < 0 || y >= input.height) continue;
						for (let ki = 0; ki < kernel; ki++) {
							const x = i * layer.stride - pad + ki * layer.dilation;
							if (x < 0 || x >= input.width) continue;
							sum += input.data[inBase + y * input.width + x] * layer.weight[weightBase + kj * kernel + ki];
						}
					}
				}
				out[outBase + j * width + i] = layer.relu && sum < 0 ? 0 : sum;
			}
		}
	}

	return { channels: layer.out, width, height, data: out };
}

/**
 * Impacts the model sees on this face, strongest first.
 *
 * A peak has to beat its eight neighbours as well as the threshold, which is what separates two arrows
 * in a group from one arrow reported nine times.
 */
export function detectArrowsLearned(
	frame: Frame,
	face: FaceLocation,
	model: ArrowModel,
	threshold = model.threshold
): LearnedArrow[] {
	return run(rectify(frame, face, model.size, model.span), face, model, threshold);
}

/**
 * The same, for a crop somebody else has already cut and rectified.
 *
 * The live camera path uses this. Detection runs on a reduced frame for speed, but the model was
 * trained on crops taken from photographs at full resolution, and handing it the reduced frame instead
 * shows it a blurrier picture than anything it has ever seen. A canvas can cut and rectify the crop
 * from the full resolution video on the GPU for almost nothing, which keeps the two the same.
 */
export function detectArrowsInCrop(
	crop: Frame,
	face: FaceLocation,
	model: ArrowModel,
	threshold = model.threshold
): LearnedArrow[] {
	const plane = crop.width * crop.height;
	const data = new Float32Array(3 * plane);
	for (let i = 0; i < plane; i++) {
		const p = i * 4;
		data[i] = (crop.data[p] / 255) * 2 - 1;
		data[plane + i] = (crop.data[p + 1] / 255) * 2 - 1;
		data[2 * plane + i] = (crop.data[p + 2] / 255) * 2 - 1;
	}
	return run({ channels: 3, width: crop.width, height: crop.height, data }, face, model, threshold);
}

function run(
	input: Tensor,
	face: FaceLocation,
	model: ArrowModel,
	threshold: number
): LearnedArrow[] {
	let tensor = input;
	for (const layer of model.layers) tensor = convolve(tensor, layer);

	const { width, height, data } = tensor;
	const plane = width * height;
	const found: LearnedArrow[] = [];

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const at = j * width + i;
			const confidence = 1 / (1 + Math.exp(-data[at]));
			if (confidence <= threshold) continue;

			let best = true;
			for (let dj = -1; dj <= 1 && best; dj++) {
				for (let di = -1; di <= 1; di++) {
					const y = j + dj;
					const x = i + di;
					if ((dj === 0 && di === 0) || x < 0 || y < 0 || x >= width || y >= height) continue;
					if (data[y * width + x] > data[at]) {
						best = false;
						break;
					}
				}
			}
			if (!best) continue;

			// The two offset channels recover a position finer than the grid the peak sits on.
			const ox = data[plane + at];
			const oy = data[2 * plane + at];
			const cropX = ((i + ox) / width) * 2 * model.span - model.span;
			const cropY = ((j + oy) / height) * 2 * model.span - model.span;

			/*
			 * A cell of the crop is not a place on the face, and reporting it as one was reporting
			 * every arrow a quarter turn from where it was shot.
			 *
			 * The crop is cut along the picture's own axes, stretched by the two lengths of the face's
			 * ellipse. Where the face lies across those axes, which is what a phone stood beside the
			 * shooting line sees, the two spaces are a quarter turn apart, and the radius is wrong with
			 * the angle: an arrow at half the face radius came back at 1.07, past the edge, where the
			 * check below then dropped it altogether. So the cell is turned back into the pixel it was
			 * cut from, and that pixel is asked where it sits on the face.
			 */
			const image = cropToImage(face, cropX, cropY);
			const point = toFaceCoords(face, image.x, image.y);
			// Off the face, measured on the face rather than in the crop.
			if (Math.hypot(point.x, point.y) >= 1) continue;

			found.push({ x: point.x, y: point.y, imageX: image.x, imageY: image.y, confidence });
		}
	}

	return found.sort((a, b) => b.confidence - a.confidence);
}

/** Exported so the canvas crop the camera cuts can be checked against the sampler training used. */
export function rectifyForTest(frame: Frame, face: FaceLocation, size: number, span: number) {
	return rectify(frame, face, size, span).data;
}

/** Exported for the preparation script, so training crops and app crops are made the same way. */
export function faceCoords(face: FaceLocation, x: number, y: number) {
	return toFaceCoords(face, x, y);
}
