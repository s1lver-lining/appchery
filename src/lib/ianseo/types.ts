/** What the app reads back from ianseo, once the HTML it is published as has been parsed away. */

export type Country = { code: string; name: string };

/** One competition as the tournament list carries it. */
export type Tournament = {
	toId: string;
	/** The organiser's own short code for the competition, such as `26MEDGAM`. */
	code: string;
	name: string;
	organiser: string;
	country: Country | null;
	city: string;
	/** The dates as ianseo prints them, kept for display: it is the only form that says "11 Jul - 11 Nov". */
	dates: string;
	/** Midnight UTC on the first and last day, resolved from the printed dates so the list can be sorted. */
	from: number | null;
	to: number | null;
	/** When ianseo last rebuilt the competition's documents, in milliseconds. */
	updatedAt: number | null;
	/**
	 * Run by the ianseo team themselves, which in practice is the national championships and the
	 * international games: the events an archer follows without having entered them.
	 */
	major: boolean;
};

/** One published document: a result list, a bracket, an entry list. */
export type CompetitionDocument = {
	/**
	 * The path under ianseo, such as `/TourData/2026/26053/IQRM.php`. Identifies the document. Null
	 * where the competition published nothing but a PDF, which is how the mandate and the practical
	 * information reach the archers who need them most.
	 */
	path: string | null;
	/** The same document as a PDF, which is what ianseo prints for the notice board. */
	pdfPath: string | null;
	/**
	 * Somewhere else entirely. A competition's information panel carries its own website as often as
	 * it carries a file: the hotels, the timetable, the route to the field. Null for everything ianseo
	 * publishes itself, which is all the rest of them.
	 */
	url: string | null;
	title: string;
	/** The panel it was published under, such as "Qualification Round". */
	group: string;
	/** Taken from the PDF link, which carries a full timestamp where the page prints only a day and a time. */
	updatedAt: number | null;
};

export type Competition = {
	toId: string;
	name: string;
	organiser: string;
	/** Venue and date, as the competition's own header prints them on one line. */
	where: string;
	documents: CompetitionDocument[];
};

export type DocumentCell = {
	text: string;
	flag: Country | null;
};

export type DocumentRow = {
	cells: DocumentCell[];
	/**
	 * The lines ianseo hides behind "Show details": the club, and the score of each distance. Held
	 * on the row so a narrow screen has somewhere to put what it cannot fit in columns.
	 */
	detail: string[];
	/** Set on the rows ianseo emphasises, which is how a qualified or a leading archer is marked. */
	strong: boolean;
};

export type DocumentColumn = {
	label: string;
	/** Dropped by ianseo's own stylesheet on a narrow screen, so the app knows what it may fold away. */
	secondary: boolean;
};

export type DocumentSection = {
	/** The class or the letter the rows below it belong to, absent on a document that has only one. */
	heading: string | null;
	columns: DocumentColumn[];
	rows: DocumentRow[];
};

export type TableDocument = {
	kind: 'table';
	title: string;
	sections: DocumentSection[];
	/** Lines this build could not read, so a page missing an archer says so instead of looking whole. */
	skipped: number;
};

/** One side of one match in an elimination bracket. */
export type BracketEntry = {
	seed: string | null;
	name: string;
	country: Country | null;
	club: string | null;
	score: string | null;
};

export type BracketMatch = {
	/** Two, or one where the draw gave a bye. An entry with no name is a slot nobody has reached yet. */
	entries: BracketEntry[];
	/** What each side shot, set by set, where the bracket carries it. One row per entry, in the same order. */
	sets: string[][];
};

export type BracketRound = {
	title: string;
	matches: BracketMatch[];
};

export type BracketDocument = {
	kind: 'bracket';
	title: string;
	rounds: BracketRound[];
	/** Lines this build could not read, so a bracket missing a match says so instead of looking whole. */
	skipped: number;
};

export type ResultDocument = TableDocument | BracketDocument;
