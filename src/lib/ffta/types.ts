/** What the app reads back from the French federation, once its pages have been parsed away. */

export type FftaCompetition = {
	/** The number the FFTA files it under, as in `/epreuve/27617`. */
	id: string;
	name: string;
	/** The dates as the FFTA prints them, which is the only form that says "Du 28 août au 3 septembre". */
	dates: string;
	from: number | null;
	to: number | null;
	/** Such as `Tir à 18m` or `Tir 3d`, in the federation's own words. */
	discipline: string;
	/** `Individuel` or `Équipe`. */
	kind: string;
	club: string;
	town: string;
	/** The results, which the FFTA publishes as a PDF and nothing else. */
	resultsPdf: string | null;
	/** The announcement a club sends out: where, when, and how to enter. */
	mandatPdf: string | null;
};

/** One of the hundred odd French départements, as the FFTA's own filter lists them. */
export type Departement = {
	/** `35`, or `2A`. What everybody calls it. */
	code: string;
	name: string;
	/** What the FFTA's filter wants instead, which is a position in its list rather than the code. */
	value: string;
};

/** A competition's own page, which carries the things the calendar row has no room for. */
export type FftaDetail = {
	id: string;
	region: string | null;
	departement: string | null;
	organiser: string | null;
	venue: string | null;
	town: string | null;
	postcode: string | null;
};
