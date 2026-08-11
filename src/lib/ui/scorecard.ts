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
	/** The sheet itself, in the order it was shot: the card is a scoresheet before it is a poster. */
	sheet: { arrows: string[]; subtotal: number; running: number }[];
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
		end: string;
		endTotal: string;
		runningTotal: string;
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
		text(value, x, y, { size: 52, weight: 700, anchor: 'middle' }) +
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
 * The sheet as it was scored: every arrow, its end total and the running total beside it. This is
 * the part another archer reads. It is drawn to fit whatever room is left, so a twelve end round and
 * a twenty end round both come out as one page rather than one page and a spill.
 */
function sheet(
	rows: CardData['sheet'],
	labels: CardData['labels'],
	from: number,
	bottom: number,
	isBest: boolean
): string {
	let top = from;
	if (rows.length === 0) return '';
	const left = 80;
	const right = 1000;
	const headRoom = 46;
	const rowHeight = Math.min(52, (bottom - from - headRoom) / rows.length);
	// A short round is centred in the room a long one would have filled, rather than left hanging.
	const headTop = from + Math.max(0, (bottom - from - (headRoom + rowHeight * rows.length)) / 2);
	const size = Math.min(28, rowHeight * 0.62);
	const widest = Math.max(...rows.map((row) => row.arrows.length));
	const arrowsLeft = left + 78;
	const pitch = Math.min(70, (right - 230 - arrowsLeft) / Math.max(widest, 1));

	top = headTop;
	const head =
		text(labels.end.toUpperCase(), left, top, { size: 22, weight: 700, fill: MUTED, spacing: 2 }) +
		text(labels.endTotal.toUpperCase(), right - 130, top, {
			size: 22,
			weight: 700,
			fill: MUTED,
			anchor: 'end',
			spacing: 2
		}) +
		text(labels.runningTotal.toUpperCase(), right, top, {
			size: 22,
			weight: 700,
			fill: MUTED,
			anchor: 'end',
			spacing: 2
		}) +
		`<line x1="${left}" y1="${top + 16}" x2="${right}" y2="${top + 16}" stroke="${LINE}" stroke-width="2" />`;

	const body = rows
		.map((row, i) => {
			const y = top + headRoom + rowHeight * (i + 0.72);
			const arrows = row.arrows
				.map((label, j) =>
					// The golds carry the colour, so a good end is visible before a number is read.
					text(label, arrowsLeft + j * pitch, y, {
						size,
						weight: label === 'X' || label === '10' ? 700 : 500,
						fill: label === 'X' || label === '10' ? GOLD : INK,
						anchor: 'middle'
					})
				)
				.join('');
			return (
				text(String(i + 1), left, y, { size: size * 0.8, weight: 600, fill: MUTED }) +
				arrows +
				text(String(row.subtotal), right - 130, y, { size, weight: 700, anchor: 'end' }) +
				text(String(row.running), right, y, { size, weight: 600, fill: MUTED, anchor: 'end' }) +
				(i < rows.length - 1
					? `<line x1="${left}" y1="${(y + rowHeight * 0.3).toFixed(1)}" x2="${right}" y2="${(y + rowHeight * 0.3).toFixed(1)}" stroke="${LINE}" stroke-width="1" opacity="0.7" />`
					: '')
			);
		})
		.join('');

	// The totals column sits on its own band, behind the figures rather than over them.
	const band = `<rect x="${right - 210}" y="${top + 20}" width="210" height="${(headRoom + rowHeight * rows.length - 16).toFixed(1)}" fill="${isBest ? GOLD : BRONZE}" opacity="0.05" />`;
	return `<g>${band}${head}${body}</g>`;
}

/** The ribbon a record wears. Nothing else on the card changes shape, only its colour and this. */
function ribbon(label: string): string {
	const caption = label.toUpperCase();
	// Sized from the text rather than measured: the card is built as a string, with nothing to ask.
	const width = 128 + caption.length * 19;
	return `
	<g>
		<rect x="80" y="168" width="${width}" height="66" rx="33" fill="${GOLD}" />
		<g transform="translate(120 201)">
			<path d="M-9 -17 l4 8 M9 -17 l-4 8" stroke="#2a1d10" stroke-width="3.4" stroke-linecap="round" fill="none" />
			<circle cx="0" cy="5" r="12" fill="none" stroke="#2a1d10" stroke-width="3.4" />
			<circle cx="0" cy="5" r="4" fill="#2a1d10" />
		</g>
		${text(caption, 152, 224, { size: 30, weight: 800, fill: '#2a1d10', spacing: 3 })}
	</g>`;
}

export function scorecardSvg(data: CardData): string {
	const best = data.isBest;
	const nameLines = wrap(data.roundName, 24);
	const nameTop = best ? 312 : 262;
	const average = data.arrows > 0 ? data.score / data.arrows : 0;
	const statTop = nameTop + (nameLines.length > 1 ? 62 : 0);

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

	${text('APPCHERY', 80, 112, { size: 30, weight: 800, fill: GOLD, spacing: 8 })}
	${text(data.date, 1000, 112, { size: 28, fill: MUTED, anchor: 'end' })}
	<line x1="80" y1="146" x2="1000" y2="146" stroke="${LINE}" stroke-width="2" />

	${best ? ribbon(data.labels.personalBest) : ''}
	${nameLines.map((line, i) => text(line, 80, nameTop + i * 62, { size: 52, weight: 700 })).join('')}

	${text(String(data.score), 74, statTop + 172, { size: 170, weight: 800, fill: 'url(#score)' })}
	${data.max ? text(`/ ${data.max}`, 1000, statTop + 172, { size: 52, weight: 600, fill: MUTED, anchor: 'end' }) : ''}
	${text(data.labels.points.toUpperCase(), 80, statTop + 212, { size: 26, weight: 700, fill: MUTED, spacing: 5 })}

	${stat(String(data.arrows), data.labels.arrows, 195, statTop + 300)}
	${stat(String(data.tens), data.labels.tens, 425, statTop + 300)}
	${stat(String(data.xs), data.labels.xs, 655, statTop + 300)}
	${stat(average.toFixed(2), data.labels.average, 885, statTop + 300)}

	${sheet(data.sheet, data.labels, statTop + 390, 1220, best)}

	${text([data.place, data.bow].filter(Boolean).join(' · '), 80, 1290, { size: 28, fill: MUTED })}
	${text(data.labels.tagline, 1000, 1290, { size: 28, weight: 600, fill: GOLD, anchor: 'end' })}
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
