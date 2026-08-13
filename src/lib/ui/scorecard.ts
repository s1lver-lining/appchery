/**
 * The picture of a round, built as one SVG string so the same markup is what the archer sees on
 * screen and what leaves the phone as an image. Drawn rather than screenshotted: a screenshot of a
 * scoring sheet is a table of numbers, and nobody shares a table.
 *
 * Portrait 4:5, which is what a phone gallery and every feed expect. The palette is chosen for the
 * card rather than taken from the app: a shared image has no theme of its own, so it carries one.
 */

export interface CardData {
	roundName: string;
	score: number;
	/** The best the round can be shot, when it is known: a score means more against its ceiling. */
	max: number | null;
	/**
	 * What the other side scored, on the card of a match. A match has no ceiling to be measured
	 * against: the only number that gives it meaning is the one it was shot against.
	 */
	opponentScore?: number | null;
	/**
	 * What the arrows added up to, when that is not the same as the score. A match is won on set
	 * points, so dividing its result by the arrows shot would say a match was worth a third of a
	 * point an arrow: the average has to be read off the arrows themselves.
	 */
	arrowTotal?: number | null;
	arrows: number;
	tens: number;
	xs: number;
	/**
	 * The sheet itself, in the order it was shot: the card is a scoresheet before it is a poster.
	 * `opponentArrows` is only ever filled on a match, and only drawn when the option asks for it.
	 */
	sheet: { arrows: string[]; subtotal: number; running: number; opponentArrows?: string[] }[];
	date: string;
	place: string | null;
	bow: string | null;
	/** Practice, competition, and so on: said only when the archer wants it said. */
	category: string | null;
	/** What the outing was called, which for a competition is the name of the competition. */
	sessionName: string | null;
	weather: { icon: WeatherGlyph; temperature: string; wind: string } | null;
	isBest: boolean;
	options: CardOptions;
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

/** What the card shows. Every one of these is the archer's to turn off before it goes anywhere. */
export interface CardOptions {
	date: boolean;
	sessionName: boolean;
	place: boolean;
	bow: boolean;
	category: boolean;
	recap: boolean;
	sheet: boolean;
	weatherIcon: boolean;
	temperature: boolean;
	wind: boolean;
	/** The other side's arrows under our own, on a match. Off unless asked for: it doubles the sheet. */
	opponentArrows: boolean;
	theme: 'dark' | 'light';
}

export const CARD_OPTION_KEYS = [
	'date',
	'sessionName',
	'place',
	'bow',
	'category',
	'recap',
	'sheet',
	'weatherIcon',
	'temperature',
	'wind',
	'opponentArrows'
] as const;

export type CardOptionKey = (typeof CARD_OPTION_KEYS)[number];

/** What a card says unless it is told otherwise: the round, and the day it was shot. */
export const DEFAULT_CARD_OPTIONS: Omit<CardOptions, 'theme'> = {
	date: true,
	// Off by default: the name of an outing means something to the archer and little to anyone else,
	// and the kind of session is usually already obvious from the round.
	sessionName: false,
	place: true,
	bow: true,
	category: false,
	recap: true,
	sheet: true,
	weatherIcon: false,
	temperature: false,
	wind: false,
	opponentArrows: false
};

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

interface Palette {
	ink: string;
	muted: string;
	gold: string;
	bronze: string;
	line: string;
	top: string;
	bottom: string;
	ribbonInk: string;
}

/** Two grounds, one card. The gold is the same in both: it is the app's colour, not the theme's. */
const PALETTES: Record<'dark' | 'light', Palette> = {
	dark: {
		ink: '#f8f4ec',
		muted: '#a2907a',
		gold: '#e8b45c',
		bronze: '#c98a2b',
		line: '#3a2f25',
		top: '#1e160e',
		bottom: '#0b0806',
		ribbonInk: '#2a1d10'
	},
	light: {
		ink: '#241a10',
		muted: '#8a7154',
		gold: '#b8791a',
		bronze: '#c98a2b',
		line: '#e0d3bd',
		top: '#fdf8ef',
		bottom: '#f2e7d4',
		ribbonInk: '#fdf8ef'
	}
};

let INK = PALETTES.dark.ink;
let MUTED = PALETTES.dark.muted;
let GOLD = PALETTES.dark.gold;
let BRONZE = PALETTES.dark.bronze;
let LINE = PALETTES.dark.line;
let RIBBON_INK = PALETTES.dark.ribbonInk;

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

export type WeatherGlyph = 'sun' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm';

/** The same skies the app draws, as paths rather than as a component: the card is a string. */
const WEATHER: Record<WeatherGlyph, string> = {
	sun: '<circle cx="12" cy="12" r="4.2" /><path d="M12 2.6v2.4M12 19v2.4M4.3 4.3l1.7 1.7M18 18l1.7 1.7M2.6 12H5M19 12h2.4M4.3 19.7L6 18M18 6l1.7-1.7" />',
	cloud: '<path d="M7.4 18.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" />',
	rain: '<path d="M7.4 15.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" /><path d="M9 18.4l-.8 2.4M13 18.4l-.8 2.4M17 18.4l-.8 2.4" />',
	snow: '<path d="M7.4 15.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" /><path d="M9 19.4h.01M13 19.4h.01M17 19.4h.01" />',
	fog: '<path d="M7.4 13.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" /><path d="M5 17h14M7 20.4h10" />',
	storm: '<path d="M7.4 14.4a4.2 4.2 0 0 1-.4-8.4 5.4 5.4 0 0 1 10.3 1.4 3.5 3.5 0 0 1-.6 7z" /><path d="M13 16.4l-2.6 3.6h3l-2 2.4" />'
};

function weatherMark(glyph: WeatherGlyph, x: number, y: number, size: number): string {
	const scale = size / 24;
	return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${WEATHER[glyph]}</g>`;
}

/** Text goes into markup, so anything the archer typed is escaped before it gets there. */
function esc(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** A column head is as wide as its column: past that the name is cut rather than run into its neighbour. */
function trim(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
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
	isBest: boolean,
	/** Draws the other side's arrows under ours, which costs every row a second line. */
	withOpponent = false
): string {
	let top = from;
	if (rows.length === 0) return '';
	const left = 80;
	const right = 1000;
	const headRoom = 46;
	const twoLines = withOpponent && rows.some((row) => (row.opponentArrows?.length ?? 0) > 0);
	const rowHeight = Math.min(twoLines ? 72 : 52, (bottom - from - headRoom) / rows.length);
	// A short round is centred in the room a long one would have filled, rather than left hanging.
	const headTop = from + Math.max(0, (bottom - from - (headRoom + rowHeight * rows.length)) / 2);
	const size = Math.min(28, rowHeight * 0.62);
	const widest = Math.max(...rows.map((row) => row.arrows.length));
	const arrowsLeft = left + 78;
	const pitch = Math.min(70, (right - 230 - arrowsLeft) / Math.max(widest, 1));

	top = headTop;
	// The two column heads are names on a match card, and a name is as long as somebody made it.
	const head =
		text(labels.end.toUpperCase(), left, top, { size: 22, weight: 700, fill: MUTED, spacing: 2 }) +
		text(trim(labels.endTotal.toUpperCase(), 10), right - 130, top, {
			size: 22,
			weight: 700,
			fill: MUTED,
			anchor: 'end',
			spacing: 2
		}) +
		text(trim(labels.runningTotal.toUpperCase(), 10), right, top, {
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
			// With both sides drawn, ours rides above the middle of the row and theirs below it.
			const ourY = twoLines ? y - rowHeight * 0.18 : y;
			const arrows = row.arrows
				.map((label, j) =>
					// The golds carry the colour, so a good end is visible before a number is read.
					text(label, arrowsLeft + j * pitch, ourY, {
						size,
						weight: label === 'X' || label === '10' ? 700 : 500,
						fill: label === 'X' || label === '10' ? GOLD : INK,
						anchor: 'middle'
					})
				)
				.join('');
			// The other side's arrows sit under ours, quieter, so a row still reads as one end.
			const theirs =
				twoLines && row.opponentArrows
					? row.opponentArrows
							.map((label, j) =>
								text(label, arrowsLeft + j * pitch, y + rowHeight * 0.16, {
									size: size * 0.8,
									weight: 500,
									fill: MUTED,
									anchor: 'middle'
								})
							)
							.join('')
					: '';

			return (
				text(String(i + 1), left, y, { size: size * 0.8, weight: 600, fill: MUTED }) +
				arrows +
				theirs +
				text(String(row.subtotal), right - 130, y, { size, weight: 700, anchor: 'end' }) +
				text(String(row.running), right, y, { size, weight: 600, fill: MUTED, anchor: 'end' }) +
				(i < rows.length - 1
					? `<line x1="${left}" y1="${(y + rowHeight * (twoLines ? 0.36 : 0.3)).toFixed(1)}" x2="${right}" y2="${(y + rowHeight * (twoLines ? 0.36 : 0.3)).toFixed(1)}" stroke="${LINE}" stroke-width="1" opacity="0.7" />`
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
			<path d="M-9 -17 l4 8 M9 -17 l-4 8" stroke="${RIBBON_INK}" stroke-width="3.4" stroke-linecap="round" fill="none" />
			<circle cx="0" cy="5" r="12" fill="none" stroke="${RIBBON_INK}" stroke-width="3.4" />
			<circle cx="0" cy="5" r="4" fill="${RIBBON_INK}" />
		</g>
		${text(caption, 152, 212, { size: 30, weight: 800, fill: RIBBON_INK, spacing: 3 })}
	</g>`;
}

export function scorecardSvg(data: CardData): string {
	const options = data.options;
	const palette = PALETTES[options.theme];
	// Set once for the helpers below, which draw the card a piece at a time in whichever ground it wears.
	INK = palette.ink;
	MUTED = palette.muted;
	GOLD = palette.gold;
	BRONZE = palette.bronze;
	LINE = palette.line;
	RIBBON_INK = palette.ribbonInk;

	const best = data.isBest;
	const versus = data.opponentScore !== null && data.opponentScore !== undefined;
	const headline = versus ? `${data.score} – ${data.opponentScore}` : String(data.score);
	// Two figures and a dash need more room than one, so the scoreline is set smaller when it is one.
	const headlineSize = versus ? (headline.length > 6 ? 120 : 140) : 170;
	// Trimmed rather than wrapped: the top line has the date at the other end of it.
	const named = options.sessionName && data.sessionName ? data.sessionName.slice(0, 28) : null;
	const title = named ?? 'APPCHERY';
	const nameLines = wrap(data.roundName, 24);
	const nameTop = best ? 312 : 262;
	const scored = data.arrowTotal ?? data.score;
	const average = data.arrows > 0 ? scored / data.arrows : 0;
	/** The footer line: what the round was, where, and with what. */
	const subtitle = [
		options.category ? data.category : null,
		options.place ? data.place : null,
		options.bow ? data.bow : null
	]
		.filter(Boolean)
		.join(' · ');

	const statTop = nameTop + (nameLines.length > 1 ? 62 : 0);
	const sheetTop = statTop + (options.recap ? 390 : 250);

	const sky = data.weather;
	const reading = [
		sky && options.temperature ? sky.temperature : null,
		sky && options.wind ? sky.wind : null
	]
		.filter(Boolean)
		.join(' · ');

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">
	<defs>
		<linearGradient id="ground" x1="0" y1="0" x2="0.4" y2="1">
			<stop offset="0" stop-color="${palette.top}" />
			<stop offset="1" stop-color="${palette.bottom}" />
		</linearGradient>
		<linearGradient id="score" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="${best ? (options.theme === 'dark' ? '#ffe6ac' : '#d99b20') : INK}" />
			<stop offset="1" stop-color="${best ? GOLD : MUTED}" />
		</linearGradient>
		<clipPath id="frame">
			<rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" />
		</clipPath>
	</defs>

	<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#ground)" />
	<g clip-path="url(#frame)">${rings(best)}</g>
	<rect x="18" y="18" width="${CARD_WIDTH - 36}" height="${CARD_HEIGHT - 36}" rx="34" fill="none" stroke="${best ? GOLD : LINE}" stroke-width="${best ? 4 : 3}" opacity="${best ? 0.7 : 1}" />

	<!-- The outing's own name takes the top line when it has one, and the app name steps aside. -->
	${
		title === 'APPCHERY'
			? text(title, 80, 112, { size: 30, weight: 800, fill: GOLD, spacing: 8 })
			: text(title, 80, 112, { size: 30, weight: 700, fill: GOLD })
	}
	${options.date ? text(data.date, 1000, 112, { size: 28, fill: MUTED, anchor: 'end' }) : ''}
	<line x1="80" y1="146" x2="1000" y2="146" stroke="${LINE}" stroke-width="2" />

	${best ? ribbon(data.labels.personalBest) : ''}
	${nameLines.map((line, i) => text(line, 80, nameTop + i * 62, { size: 52, weight: 700 })).join('')}

	<!-- A match is a scoreline, so it is written as one: the two figures belong side by side. -->
	${text(headline, 74, statTop + 172, { size: headlineSize, weight: 800, fill: 'url(#score)' })}
	${
		data.max
			? text(`/ ${data.max}`, 1000, statTop + 172, { size: 52, weight: 600, fill: MUTED, anchor: 'end' })
			: ''
	}
	${text(data.labels.points.toUpperCase(), 80, statTop + 212, { size: 26, weight: 700, fill: MUTED, spacing: 5 })}

	<!-- The sky sits well above the ceiling score, on its own two lines, rather than beside a number. -->
	${sky && options.weatherIcon ? weatherMark(sky.icon, 900, statTop - 52, 100) : ''}
	${reading ? text(reading, 1000, statTop + 74, { size: 30, weight: 600, fill: MUTED, anchor: 'end' }) : ''}

	${
		options.recap
			? stat(String(data.arrows), data.labels.arrows, 195, statTop + 300) +
				stat(String(data.tens), data.labels.tens, 425, statTop + 300) +
				stat(String(data.xs), data.labels.xs, 655, statTop + 300) +
				stat(average.toFixed(2), data.labels.average, 885, statTop + 300)
			: ''
	}

	${options.sheet ? sheet(data.sheet, data.labels, sheetTop, 1220, best, options.opponentArrows) : ''}

	${subtitle ? text(subtitle, 80, 1290, { size: 28, fill: MUTED }) : ''}
	${text(data.labels.tagline, 1000, 1290, { size: 28, weight: 600, fill: GOLD, anchor: 'end' })}
</svg>`;
}

/**
 * The card as an image file.
 *
 * JPEG rather than PNG: the ground is a gradient, so PNG cannot index it and comes out at a megabyte
 * or more. That size is not the file, it is the wait: on a phone the bytes cross the bridge to the
 * filesystem plugin as base64, and a megabyte of it costs seconds. At this quality and this size the
 * difference is not visible, and the wait is gone.
 *
 * Drawn through an object URL rather than a data URL so the markup is never turned into one long
 * string on its way into the image.
 */
export async function scorecardImage(svg: string, type = 'image/jpeg', quality = 0.94): Promise<Blob> {
	const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
	try {
		const image = new Image();
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error('The card could not be drawn'));
			image.src = source;
		});

		const canvas = document.createElement('canvas');
		canvas.width = CARD_WIDTH;
		canvas.height = CARD_HEIGHT;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('The card could not be drawn');
		context.drawImage(image, 0, 0, canvas.width, canvas.height);

		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('The card could not be drawn'))),
				type,
				quality
			);
		});
	} finally {
		URL.revokeObjectURL(source);
	}
}
