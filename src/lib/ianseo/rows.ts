import type { DocumentColumn, DocumentRow } from './types';

/**
 * Which column of a published document holds a person and which holds the body they shoot for.
 *
 * ianseo lets each organiser label its own columns, so this is a guess and is treated as one: it is
 * only ever used to offer a name to follow, and a document it cannot read simply offers nothing.
 * Nothing in the app depends on it having been right.
 */

/*
 * The words ianseo's own translations put over these two columns, in the languages it ships in.
 * Held without their accents, because `plain` compares that way; the Cyrillic and Greek entries are
 * written as `plain` leaves them, without their breves and their tonos.
 */
const PERSON = new Set([
	// English
	'athlete', 'athlete name', 'archer', 'name', 'full name', 'competitor', 'participant',
	// French, Catalan
	'nom', "nom de l'athlete", 'tireur', 'arquer',
	// Spanish, Portuguese
	'nombre', 'atleta', 'arquero', 'deportista', 'tirador', 'nome', 'arqueiro',
	// Italian, Romanian
	'arciere', 'nominativo', 'nume', 'sportiv', 'arcas', 'concurent',
	// German, Dutch
	'sportler', 'sportlerin', 'athlet', 'schutze', 'teilnehmer', 'naam', 'sporter', 'schutter', 'deelnemer',
	// Nordic, Finnish, Estonian
	'namn', 'navn', 'skytt', 'skytte', 'deltagare', 'deltager', 'utover', 'nimi', 'ampuja', 'urheilija', 'osallistuja', 'sportlane',
	// Polish, Czech, Slovak, Hungarian
	'zawodnik', 'nazwisko', 'imie', 'imie i nazwisko', 'uczestnik', 'jmeno', 'zavodnik', 'strelec', 'sportovec', 'meno', 'pretekar', 'nev', 'versenyzo', 'sportolo',
	// Slovene, Croatian, Serbian
	'ime', 'priimek', 'prezime', 'tekmovalec', 'strijelac', 'natjecatelj', 'takmicar',
	// Latvian, Lithuanian, Turkish
	'vards', 'sportists', 'vardas', 'sportininkas', 'dalyvis', 'sporcu', 'ad', 'adi', 'isim', 'ad soyad',
	// Greek, Russian, Ukrainian, Bulgarian
	'αθλητης', 'ονομα', 'ονοματεπωνυμο', 'спортсмен', 'спортист', 'участник', 'учасник', 'имя', 'фамилия', 'фио',
	// Japanese, Korean, Chinese
	'選手', '氏名', '名前', '이름', '선수', '성명', '姓名', '运动员', '運動員',
]);
const BODY = new Set([
	// English
	'country', 'country name', 'nation', 'noc', 'club', 'clubs', 'club name', 'team', 'society', 'association', 'federation', 'region', 'clubs / pays', 'club / pays',
	// French, Catalan
	'pays', 'equipe', 'societe', 'comite', 'ligue', 'equip',
	// Spanish, Portuguese
	'pais', 'equipo', 'sociedad', 'federacion', 'delegacion', 'entidad', 'clube', 'equipa', 'nacao',
	// Italian, Romanian
	'societa', 'nazione', 'paese', 'squadra', 'comitato', 'regione', 'tara', 'echipa',
	// German, Dutch
	'verein', 'land', 'mannschaft', 'verband', 'nationalitat', 'vereniging', 'natie', 'ploeg',
	// Nordic, Finnish, Estonian
	'klubb', 'forening', 'lag', 'landslag', 'seura', 'maa', 'joukkue', 'riik',
	// Polish, Czech, Slovak, Hungarian
	'klub', 'kraj', 'druzyna', 'panstwo', 'zeme', 'oddil', 'druzstvo', 'krajina', 'tim', 'egyesulet', 'orszag', 'csapat',
	// Slovene, Croatian, Serbian
	'drzava', 'ekipa', 'momcad', 'drustvo',
	// Latvian, Lithuanian, Turkish
	'klubas', 'salis', 'komanda', 'klubs', 'valsts', 'klubi', 'kulup', 'ulke', 'takim',
	// Greek, Russian, Ukrainian, Bulgarian
	'συλλογος', 'χωρα', 'ομαδα', 'εθνος', 'клуб', 'страна', 'регион', 'краина', 'държава', 'отбор',
	// Japanese, Korean, Chinese
	'所属', '国', 'チーム', '클럽', '국가', '팀', '소속', '俱乐部', '国家', '队', '隊',
]);

/**
 * Compared without its accents, because ianseo prints each competition's columns in the organiser's
 * own language: the same list is headed `Athlete` in one country and `Athlète` in the next, and one
 * of those spellings used to leave the app unable to tell which column held the archer.
 */
function plain(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		// Put back together what decomposing took apart: Hangul comes out of NFD as separate letters.
		.normalize('NFC')
		.replace(/\s+/g, ' ');
}

function indexOf(columns: DocumentColumn[], labels: Set<string>, skip = -1): number | null {
	const at = columns.findIndex(
		(column, index) => index !== skip && labels.has(plain(column.label))
	);
	return at < 0 ? null : at;
}

export function personColumn(columns: DocumentColumn[]): number | null {
	return indexOf(columns, PERSON);
}

/** A national event writes clubs under a column it still calls Country, so the two are one question. */
export function bodyColumn(columns: DocumentColumn[]): number | null {
	return indexOf(columns, BODY, personColumn(columns) ?? -1);
}

/**
 * What a row offers to follow: whoever it names, and whoever they shoot for. A table with nobody in
 * it offers nothing, so the count of entries per country is never read as a list of clubs.
 */
export function followable(
	row: DocumentRow,
	columns: DocumentColumn[]
): { kind: 'archer' | 'club'; label: string }[] {
	const found: { kind: 'archer' | 'club'; label: string }[] = [];
	const person = personColumn(columns);
	const body = bodyColumn(columns);
	const text = (at: number | null) => (at === null ? '' : (row.cells[at]?.text ?? '')).trim();

	if (person === null || !text(person)) return found;
	found.push({ kind: 'archer', label: text(person) });
	if (text(body)) found.push({ kind: 'club', label: text(body) });
	return found;
}

/** A row is marked when it names somebody the archer follows, which is the point of following them. */
export function marked(row: DocumentRow, labels: Set<string>): boolean {
	if (labels.size === 0) return false;
	return row.cells.some((cell) => cell.text.trim() !== '' && labels.has(cell.text.trim().toLowerCase()));
}
