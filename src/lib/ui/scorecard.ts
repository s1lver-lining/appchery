/**
 * The picture of a round, built as one SVG string so the same markup is what the archer sees on
 * screen and what leaves the phone as an image. Drawn rather than screenshotted: a screenshot of a
 * scoring sheet is a table of numbers, and nobody shares a table.
 *
 * Portrait 4:5, which is what a phone gallery and every feed expect. Colours are literal rather than
 * themed, because a shared image has no theme: it is the same card whoever opens it.
 */

export interface CardData {
	roundName: string;
	score: number;
	/** The best the round can be shot, when it is known: a score means more against its ceiling. */
	max: number | null;
	arrows: number;
	tens: number;
	xs: number;
	/** Every end in the order it was shot, which is the shape of the round. */
	ends: number[];
	date: string;
	place: string | null;
	bow: string | null;
	isBest: boolean;
	labels: {
		points: string;
		arrows: string;
		tens: string;
		xs: string;
		average: string;
		personalBest: string;
		ends: string;
		tagline: string;
	};
}

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const INK = '#f8f4ec';
const MUTED = '#a2907a';
const GOLD = '#e8b45c';
const BRONZE = '#c98a2b';
const LINE = '#3a2f25';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

/** Text goes into markup, so anything the archer typed is escaped before it gets there. */
function esc(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Long round names break onto a second line rather than shrinking away to nothing. */
function wrap(text: string, perLine: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		if (line && (line + ' ' + word).length > perLine) {
			lines.push(line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}
	if (line) lines.push(line);
	return lines.slice(0, 2);
}

function text(
	value: string,
	x: number,
	y: number,
	options: { size: number; weight?: number | string; fill?: string; anchor?: string; spacing?: number }
): string {
	const { size, weight = 400, fill = INK, anchor = 'start', spacing = 0 } = options;
	return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(value)}</text>`;
}

/** One figure and its caption, the unit the middle band of the card is built from. */
function stat(value: string, label: string, x: number, y: number): string {
	return (
		text(value, x, y, { size: 62, weight: 700, anchor: 'middle' }) +
		text(label.toUpperCase(), x, y + 40, {
			size: 24,
			weight: 600,
			fill: MUTED,
			anchor: 'middle',
			spacing: 2
		})
	);
}

/**
 * The rings the app is built around, struck from off the corner. They carry the card: without them
 * it is a poster of numbers, and with them it is unmistakably about archery.
 */
function rings(isBest: boolean): string {
	const cx = 1180;
	const cy = 1180;
	return [44, 34, 24, 14]
		.map(
			(r, i) =>
				`<circle cx="${cx}" cy="${cy}" r="${r * 12}" fill="none" stroke="${isBest ? GOLD : BRONZE}" stroke-width="26" opacity="${0.07 + i * 0.025}" />`
		)
		.join('');
}

/**
 * The run of ends as a line rather than as bars. Ends of one round sit within a few points of each
 * other, so bars from zero draw twelve identical blocks; the line is scaled to the round's own
 * spread, which is where its story actually is, and is labelled as a shape rather than read off.
 */
function endLine(ends: number[], isBest: boolean, label: string): string {
	if (ends.length < 2) return '';
	const left = 80;
	const width = 920;
	const top = 990;
	const height = 130;
	const base = top + height;

	const low = Math.min(...ends);
	const high = Math.max(...ends);
	const span = high - low || 1;
	const points = ends.map((subtotal, i) => ({
		x: left + (i / (ends.length - 1)) * width,
		y: base - ((subtotal - low) / span) * height
	}));

	const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
	const area = `${line} L${(left + width).toFixed(1)},${base} L${left},${base} Z`;
	const colour = isBest ? GOLD : BRONZE;
	const dots = points
		.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="${colour}" />`)
		.join('');

	return `
	<g>
		<path d="${area}" fill="${colour}" opacity="0.12" />
		<path d="${line}" fill="none" stroke="${colour}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
		${dots}
		<line x1="${left}" y1="${base + 24}" x2="${left + width}" y2="${base + 24}" stroke="${LINE}" stroke-width="2" />
		${text(label.toUpperCase(), left, base + 62, { size: 24, weight: 600, fill: MUTED, spacing: 2 })}
		${text(`${low}–${high}`, left + width, base + 62, { size: 24, weight: 600, fill: MUTED, anchor: 'end' })}
	</g>`;
}

/** The ribbon a record wears. Nothing else on the card changes shape, only its colour and this. */
function ribbon(label: string): string {
	const caption = label.toUpperCase();
	// Sized from the text rather than measured: the card is built as a string, with nothing to ask.
	const width = 128 + caption.length * 19;
	return `
	<g>
		<rect x="80" y="206" width="${width}" height="66" rx="33" fill="${GOLD}" />
		<g transform="translate(120 239)">
			<path d="M-9 -17 l4 8 M9 -17 l-4 8" stroke="#2a1d10" stroke-width="3.4" stroke-linecap="round" fill="none" />
			<circle cx="0" cy="5" r="12" fill="none" stroke="#2a1d10" stroke-width="3.4" />
			<circle cx="0" cy="5" r="4" fill="#2a1d10" />
		</g>
		${text(caption, 152, 262, { size: 30, weight: 800, fill: '#2a1d10', spacing: 3 })}
	</g>`;
}

export function scorecardSvg(data: CardData): string {
	const best = data.isBest;
	const nameLines = wrap(data.roundName, 22);
	const nameTop = best ? 430 : 390;
	const average = data.arrows > 0 ? data.score / data.arrows : 0;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">
	<defs>
		<linearGradient id="ground" x1="0" y1="0" x2="0.4" y2="1">
			<stop offset="0" stop-color="#1e160e" />
			<stop offset="1" stop-color="#0b0806" />
		</linearGradient>
		<linearGradient id="score" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="${best ? '#ffe6ac' : INK}" />
			<stop offset="1" stop-color="${best ? GOLD : '#c9bba2'}" />
		</linearGradient>
		<clipPath id="frame">
			<rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" />
		</clipPath>
	</defs>

	<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#ground)" />
	<g clip-path="url(#frame)">${rings(best)}</g>
	<rect x="18" y="18" width="${CARD_WIDTH - 36}" height="${CARD_HEIGHT - 36}" rx="34" fill="none" stroke="${best ? GOLD : LINE}" stroke-width="${best ? 4 : 3}" opacity="${best ? 0.7 : 1}" />

	${text('APPCHERY', 80, 132, { size: 30, weight: 800, fill: GOLD, spacing: 8 })}
	${text(data.date, 1000, 132, { size: 28, fill: MUTED, anchor: 'end' })}
	<line x1="80" y1="168" x2="1000" y2="168" stroke="${LINE}" stroke-width="2" />

	${best ? ribbon(data.labels.personalBest) : ''}
	${nameLines.map((line, i) => text(line, 80, nameTop + i * 64, { size: 56, weight: 700 })).join('')}

	${text(String(data.score), 74, 700, { size: 260, weight: 800, fill: 'url(#score)' })}
	${text(data.labels.points.toUpperCase(), 80, 758, { size: 28, weight: 700, fill: MUTED, spacing: 5 })}
	${data.max ? text(`/ ${data.max}`, 1000, 700, { size: 60, weight: 600, fill: MUTED, anchor: 'end' }) : ''}

	<line x1="80" y1="812" x2="1000" y2="812" stroke="${LINE}" stroke-width="2" />
	${stat(String(data.arrows), data.labels.arrows, 195, 890)}
	${stat(String(data.tens), data.labels.tens, 425, 890)}
	${stat(String(data.xs), data.labels.xs, 655, 890)}
	${stat(average.toFixed(2), data.labels.average, 885, 890)}

	${endLine(data.ends, best, data.labels.ends)}

	${text([data.place, data.bow].filter(Boolean).join(' · '), 80, 1268, { size: 28, fill: MUTED })}
	${text(data.labels.tagline, 1000, 1268, { size: 28, weight: 600, fill: GOLD, anchor: 'end' })}
</svg>`;
}
/**
 * The card as a PNG. Drawn through an image rather than exported by the browser, because nothing
 * else turns SVG into a file a share sheet will take.
 */
export async function scorecardPng(svg: string, scale = 1): Promise<Blob> {
	const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	const image = new Image();
	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('The card could not be drawn'));
		image.src = source;
	});

	const canvas = document.createElement('canvas');
	canvas.width = CARD_WIDTH * scale;
	canvas.height = CARD_HEIGHT * scale;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('The card could not be drawn');
	context.drawImage(image, 0, 0, canvas.width, canvas.height);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('The card could not be drawn'))),
			'image/png'
		);
	});
}
