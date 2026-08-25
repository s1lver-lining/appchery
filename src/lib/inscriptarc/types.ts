/** A competition that is open for entry online, as Inscript'Arc lists it. */
export type Entry = {
	/** The competition's own address on the platform, which is what makes it a competition rather than a row. */
	site: string;
	name: string;
	/** The organising club, as the platform prints it. */
	club: string;
	/** The club's FFTA affiliation number, which nothing else the app reads carries. */
	affiliation: string | null;
	/** The dates as printed, kept because it is the only form that says "du 26/08 au 29/08". */
	dates: string;
	from: number | null;
	to: number | null;
	/** Where to enter, where to read what the club published, and who has entered already. */
	links: { label: string; href: string }[];
};
