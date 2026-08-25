import { describe, it, expect } from 'vitest';
import { cells, decode, flagOf, hasClass, rows, tags, text } from './html';

describe('decode', () => {
	it('reads the named entities the pages use', () => {
		expect(decode('a&nbsp;b &amp; c &lt;d&gt;')).toBe('a b & c <d>');
	});

	it('reads an entity ianseo forgot to close, which its result lines are full of', () => {
		expect(decode('18m-1:&nbsp287')).toBe('18m-1: 287');
	});

	it('reads numeric entities in both bases', () => {
		expect(decode('&#39;&#x2019;')).toBe("'’");
	});

	it('reads the accented letters organisers type, in the case they typed them', () => {
		expect(decode("rue de l&eacute;glise")).toBe("rue de l'église".replace("'", ''));
		expect(decode('&Eacute;quipe &agrave; M&uuml;nchen')).toBe('Équipe à München');
	});

	it('leaves an ampersand that is not an entity alone', () => {
		expect(decode('Class & Division')).toBe('Class & Division');
	});
});

describe('text', () => {
	it('takes the tags out and closes up the spaces they leave', () => {
		expect(text('<td>  <b>583</b>\n<i>  </i> total </td>')).toBe('583 total');
	});

	it('does not leave a space in front of a comma a tag was hiding behind', () => {
		expect(text("18m-1:&nbsp<span class='b'>287</span>,&nbsp;18m-2:&nbsp<span>296</span>")).toBe(
			'18m-1: 287, 18m-2: 296'
		);
	});
});

describe('tags', () => {
	it('reads a block whole rather than stopping at the first closing tag inside it', () => {
		const [panel] = tags('<div class="panel">a<div>b</div>c</div>', 'div');
		expect(panel.html).toBe('a<div>b</div>c');
	});

	it('finds every block at every depth, outermost first', () => {
		expect(tags('<div>a<div>b</div></div><div>c</div>', 'div').map((tag) => tag.html)).toEqual([
			'a<div>b</div>',
			'b',
			'c'
		]);
	});
});

describe('cells', () => {
	it('reads td and th into one row, so a column index means the same for both', () => {
		const row = cells('<th class="h">Pos.</th><td>1</td><td>DUCROCQ Tanguy</td>');
		expect(row.map((cell) => cell.header)).toEqual([true, false, false]);
		expect(row.map((cell) => text(cell.html))).toEqual(['Pos.', '1', 'DUCROCQ Tanguy']);
	});

	it('steps over a table nested in a cell instead of counting its cells as the row’s own', () => {
		const row = cells(
			'<td>a</td><td class="set-points-container"><table><tr><td>23</td><td>24</td></tr></table></td><td>b</td>'
		);
		expect(row.map((cell) => text(cell.html))).toEqual(['a', '', 'b']);
		expect(row[1].nested).toHaveLength(1);
		const [line] = rows(row[1].nested[0]);
		expect(cells(line.html).map((cell) => text(cell.html))).toEqual(['23', '24']);
	});

	it('keeps the rest of a cell that also holds a nested table', () => {
		const row = cells('<td>before<table><tr><td>x</td></tr></table>after</td>');
		expect(text(row[0].html)).toBe('before after');
	});
});

describe('hasClass', () => {
	it('matches a whole class and never half of one', () => {
		expect(hasClass('class="results-secondary-lines top"', 'results-secondary-lines')).toBe(true);
		expect(hasClass('class="bold-italic"', 'bold')).toBe(false);
		expect(hasClass('', 'bold')).toBe(false);
	});
});

describe('flagOf', () => {
	it('reads the country off the image ianseo draws instead of writing it', () => {
		expect(flagOf('<img class="flag-border" src="Flags/ITA-small.png" title="Italy" alt="ITA"/>')).toEqual({
			code: 'ITA',
			name: 'Italy'
		});
	});

	it('has no country for a cell with no flag in it, or an image that is not one', () => {
		expect(flagOf('Crispiano')).toBe(null);
		expect(flagOf('<img src="pdf.png" alt="PDF document"/>')).toBe(null);
	});
});
