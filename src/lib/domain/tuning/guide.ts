import type { Locale } from '$lib/i18n';

/**
 * The order a bow is set up in, as a reading list rather than as a form.
 *
 * Setting up a bow is a sequence: every step assumes the ones above it are already right, which is
 * why the page is numbered and why a step says what it depends on rather than standing alone. The
 * recurve order follows the way the job is actually done, from the geometry of the bare bow through
 * fitting the arrows to it and only then to fine tuning. The compound order is the same idea for a
 * bow whose geometry is set by its cams.
 *
 * The text is written here rather than in the dictionaries because a step is a small document, with
 * a list of actions and a table of what a result suggests, and neither fits a flat key.
 */

export type GuideBow = 'recurve' | 'compound';

/** The pictures worth drawing. A step with no geometry to show carries none. */
export type DiagramName =
	| 'limbAlignment'
	| 'centreShot'
	| 'tiller'
	| 'nockingPoint'
	| 'bareShaft'
	| 'paperTear';

export interface GuideStep {
	key: string;
	bow: GuideBow;
	diagram?: DiagramName;
	/** The tuning activity this step is done as, when it is something shot rather than measured. */
	templateKey?: string;
	/** Settings this step writes, so the step can point at the fields it is about. */
	settings?: string[];
}

export interface StepText {
	title: string;
	/** One line on why the step exists, which is what makes an order feel like a reason. */
	why: string;
	steps: string[];
	results: { observation: string; suggests: string }[];
}

export const GUIDE_STEPS: GuideStep[] = [
	{ key: 'limb-alignment', bow: 'recurve', diagram: 'limbAlignment', templateKey: 'limb-alignment' },
	{ key: 'limb-twist', bow: 'recurve' },
	{ key: 'rest-position', bow: 'recurve', templateKey: 'rest-position' },
	{ key: 'centre-shot', bow: 'recurve', diagram: 'centreShot', templateKey: 'centre-shot' },
	{ key: 'sight-alignment', bow: 'recurve' },
	{ key: 'rest-overhang', bow: 'recurve' },
	{ key: 'brace-height', bow: 'recurve', templateKey: 'brace-height', settings: ['braceHeight'] },
	{
		key: 'tiller',
		bow: 'recurve',
		diagram: 'tiller',
		templateKey: 'tiller',
		settings: ['tillerUpper', 'tillerLower']
	},
	{ key: 'nocking-point', bow: 'recurve', diagram: 'nockingPoint', templateKey: 'nocking-point' },
	{ key: 'draw-length', bow: 'recurve', settings: ['arrowLength'] },
	{ key: 'arrow-spine', bow: 'recurve', settings: ['arrowSpine', 'pointWeight'] },
	{ key: 'bare-shaft', bow: 'recurve', diagram: 'bareShaft', templateKey: 'bare-shaft' },

	{ key: 'spec-check', bow: 'compound', settings: ['axleToAxle', 'braceHeight'] },
	{ key: 'cam-sync', bow: 'compound', templateKey: 'cam-timing' },
	{ key: 'draw-stop', bow: 'compound', templateKey: 'draw-stop', settings: ['drawLength'] },
	{ key: 'compound-rest', bow: 'compound', diagram: 'centreShot', templateKey: 'centre-shot' },
	{ key: 'd-loop', bow: 'compound', diagram: 'nockingPoint', templateKey: 'nocking-point' },
	{ key: 'peep', bow: 'compound', templateKey: 'peep-alignment', settings: ['peepHeight'] },
	{ key: 'clearance', bow: 'compound', templateKey: 'clearance' },
	{ key: 'paper-tune', bow: 'compound', diagram: 'paperTear', templateKey: 'paper-tune' },
	{ key: 'walk-back', bow: 'compound', templateKey: 'walk-back' },
	{ key: 'compound-bare-shaft', bow: 'compound', diagram: 'bareShaft', templateKey: 'bare-shaft' },
	{ key: 'third-axis', bow: 'compound' }
];

const EN: Record<string, StepText> = {
	'limb-alignment': {
		title: 'Limb alignment',
		why: 'Limbs that sit off the bow plane push the arrow sideways on every shot, and no amount of tuning further down this list can correct it.',
		steps: [
			'Brace the bow and look down the string from behind, with the bow upright.',
			'The string should split both limbs down their middle, and run through the middle of the grip.',
			'Adjust the limb pockets: alignment carriages on a modern riser, eccentric bolts on an older one.',
			'Check again after every change, since moving one limb moves what the other looks like.'
		],
		results: [
			{ observation: 'String sits left of the limb centre', suggests: 'Move that limb right, a small turn at a time' },
			{ observation: 'String looks centred on one limb only', suggests: 'Align the worse limb first, then recheck both' },
			{ observation: 'No adjustment brings it in', suggests: 'Suspect a twisted limb: go to the next step' }
		]
	},
	'limb-twist': {
		title: 'Limb twist',
		why: 'A twisted limb cannot be aligned, and every measurement taken after it will be chasing a fault that is not where it seems.',
		steps: [
			'Brace the bow and sight down the string with the limbs level.',
			'Look at each limb tip: the string groove should sit square, not leaning to one side.',
			'Unstring, then check the limb rails are flat against the pocket faces.',
			'A limb that fails this is a warranty matter, not a tuning one.'
		],
		results: [
			{ observation: 'One tip leans consistently', suggests: 'Have the limb changed rather than compensated for' },
			{ observation: 'Both tips square, alignment still off', suggests: 'The riser pockets are the fault: return to alignment' }
		]
	},
	'rest-position': {
		title: 'Rest position',
		why: 'Everything the arrow does on release starts from where it sits, so the rest is placed before anything is measured from it.',
		steps: [
			'Sit the rest on its natural place on the shelf: the arrow should pass over the pivot point of the grip.',
			'Set the arrow height so it is roughly level, or a fraction above the pressure button centre.',
			'Stick or screw it down only once the arrow sits where it should.'
		],
		results: [
			{ observation: 'Arrow sits well above the button', suggests: 'Lower the rest arm: the button should meet the shaft centre' },
			{ observation: 'Arrow touches the shelf', suggests: 'Raise the rest arm until the shaft is clear' }
		]
	},
	'centre-shot': {
		title: 'Centre shot',
		why: 'Where the arrow points at full draw decides which way it leaves the bow, and it is the one setting a plunger exists to change.',
		steps: [
			'Brace the bow and nock an arrow on the rest.',
			'Look down the string with the bow upright: the string should cut the shaft slightly to the inside of centre.',
			'For a right handed bow the point should sit a little left of the string line, a millimetre or two.',
			'Set it with the button barrel, not with the rest.'
		],
		results: [
			{ observation: 'String cuts the point exactly', suggests: 'Wind the button out slightly, so the shaft points a touch inside' },
			{ observation: 'Point far outside the string line', suggests: 'Wind the button in: the arrow will read stiff otherwise' }
		]
	},
	'sight-alignment': {
		title: 'Sight alignment',
		why: 'A sight that is not on the bow plane makes the windage change with every distance, which reads as an arrow problem it is not.',
		steps: [
			'Turn the sight so the ring or pin sits over the string line with the bow braced.',
			'Run the sight block from its highest to its lowest position, watching the pin against the string.',
			'The pin should stay on the string line the whole way.'
		],
		results: [
			{ observation: 'Pin drifts sideways as the block moves', suggests: 'The sight bar is not parallel to the bow plane: shim or realign it' },
			{ observation: 'Pin sits off the string but stays parallel', suggests: 'Leave it: your windage mark will absorb a constant offset' }
		]
	},
	'rest-overhang': {
		title: 'Rest overhang',
		why: 'A rest arm that reaches too far into the shaft path catches a vane, and a caught vane throws an arrow that was otherwise perfect.',
		steps: [
			'Look at how far the rest arm reaches under the shaft.',
			'It should hold the arrow with less than the shaft radius of overhang.',
			'Dust the vanes with foot spray or lipstick and shoot: nothing should mark the rest or the riser.'
		],
		results: [
			{ observation: 'Marks on the rest arm', suggests: 'Shorten the overhang, or rotate the nock so a vane clears' },
			{ observation: 'Marks on the riser above the rest', suggests: 'Check nocking point and clearance before touching the rest' }
		]
	},
	'brace-height': {
		title: 'Brace height',
		why: 'The brace height sets how long the string pushes the arrow, which changes the noise, the feel and where the group sits.',
		steps: [
			'Measure from the string to the pivot point of the grip, with the bow braced and settled.',
			'Start from the limb maker figure, or from a bow length table: roughly 21 to 22 cm for a 66 inch bow, 23 to 24 cm for a 70 inch.',
			'Twist the string to raise it, untwist to lower it, a few turns at a time.',
			'Shoot a group at each setting and keep the quietest, steadiest one.'
		],
		results: [
			{ observation: 'Loud, harsh shot', suggests: 'Raise the brace a few string turns' },
			{ observation: 'Sluggish, dead feeling arrows', suggests: 'Lower the brace a few string turns' },
			{ observation: 'String slaps the arm', suggests: 'Raise the brace, then check your bow arm rotation' }
		]
	},
	tiller: {
		title: 'Tiller',
		why: 'The tiller balances how hard the two limbs pull against a hand that holds the string below centre, which is what keeps the nock travelling level.',
		steps: [
			'Measure from the string to where each limb meets the riser, square to the limb.',
			'Subtract the lower from the upper: that difference is the tiller.',
			'Start at about +0.6 cm for a recurve with a sight, and about 0 for a barebow.',
			'Change it with the limb bolts, keeping the total draw weight in mind: turns in raise weight.'
		],
		results: [
			{ observation: 'Bare shaft consistently high', suggests: 'Increase tiller slightly, or lower the nocking point first' },
			{ observation: 'Bare shaft consistently low', suggests: 'Reduce tiller slightly, or raise the nocking point first' },
			{ observation: 'Bow jumps forward oddly on release', suggests: 'Return to the starting tiller and retune the nocking point' }
		]
	},
	'nocking-point': {
		title: 'Nocking point',
		why: 'The nocking point decides the vertical angle the arrow leaves at, and a wrong one shows up as vertical spread nobody can shoot out.',
		steps: [
			'Sit a bow square on the rest and clip it to the string.',
			'Set the top of the lower nock set about 0.5 cm above square to start.',
			'Fit the second nock set above the nock so the arrow cannot slide.',
			'Prove it with a bare shaft at short range once the rest of the geometry is set.'
		],
		results: [
			{ observation: 'Bare shaft hits high', suggests: 'Move the nocking point up' },
			{ observation: 'Bare shaft hits low', suggests: 'Move the nocking point down' },
			{ observation: 'Bare shaft porpoises in flight', suggests: 'The nocking point is far out: move in larger steps' }
		]
	},
	'draw-length': {
		title: 'Draw length',
		why: 'Arrow length and spine both hang off this figure, so it is measured once, properly, before any arrow is cut.',
		steps: [
			'Draw and anchor as you shoot, with a long measuring arrow.',
			'Read the distance from the string groove to the pivot point of the grip, and add 1.75 inches for the standard draw length.',
			'Repeat three times on different days: it moves with form.',
			'Leave the shaft long enough to clear the rest at full draw, plus a small margin.'
		],
		results: [
			{ observation: 'Figure moves more than half an inch', suggests: 'Form is still settling: measure again before cutting shafts' },
			{ observation: 'Point reaches the rest at full draw', suggests: 'The shafts are too short: this is a safety matter, replace them' }
		]
	},
	'arrow-spine': {
		title: 'Choose the shaft: spine and point weight',
		why: 'Everything above set the bow up; this step picks the arrow to match it. A shaft that is wrong for the bow cannot be tuned straight, only compensated for until something else is wrong.',
		steps: [
			'Take the draw weight on your fingers at your draw length, not the number on the limbs.',
			'Read a spine chart with that weight, your arrow length and your point weight.',
			'Prefer the chart the shaft maker publishes for their own shafts.',
			'Change point weight to move the dynamic spine: heavier points act weaker.'
		],
		results: [
			{ observation: 'Bare shaft always reads weak', suggests: 'Lighter point, shorter shaft, or a stiffer spine' },
			{ observation: 'Bare shaft always reads stiff', suggests: 'Heavier point, longer shaft, or a weaker spine' },
			{ observation: 'Front of centre balance under 10 %', suggests: 'Add point weight: the arrow will steer poorly downwind' }
		]
	},
	'bare-shaft': {
		title: 'Prove the setup with bare shafts',
		why: 'The last step, and the only one that tests bow and arrow together: an unfletched arrow shows what the shot really does before the vanes hide it, and sends you back to the button or the nocking point with an answer.',
		steps: [
			'Shoot three fletched arrows and one bare shaft at the same mark, at 10 to 15 metres.',
			'Note where the bare shaft sits relative to the fletched group.',
			'Fix vertical first with the nocking point, then horizontal with the button.',
			'Change one thing at a time, then shoot the set again.'
		],
		results: [
			{ observation: 'Bare shaft left of the group, right handed', suggests: 'Reading stiff: soften the button spring or add point weight' },
			{ observation: 'Bare shaft right of the group, right handed', suggests: 'Reading weak: stiffen the button spring or reduce point weight' },
			{ observation: 'Bare shaft high or low', suggests: 'Move the nocking point before touching anything sideways' }
		]
	},

	'spec-check': {
		title: 'Check the bow against its spec',
		why: 'A compound is a machine built to numbers: if axle to axle and brace height are off the sheet, something has moved and tuning will not hold.',
		steps: [
			'Measure axle to axle and brace height with the bow at rest.',
			'Compare against the numbers the maker publishes for that model and draw length.',
			'A difference usually means cable or string stretch, or a limb bolt that has moved.'
		],
		results: [
			{ observation: 'Axle to axle long, brace short', suggests: 'Strings and cables have stretched: twist them back to spec' },
			{ observation: 'Both far off with new strings', suggests: 'Check limb bolt turns are equal, then have the bow pressed' }
		]
	},
	'cam-sync': {
		title: 'Cam timing and synchronisation',
		why: 'Cams that arrive at the wall at different moments tip the nock as it leaves, and no rest position can hide it.',
		steps: [
			'Draw the bow on a press or a hooter shooter, or have someone watch while you draw.',
			'Watch both cams reach their stops: they should hit together.',
			'Twist the cable that lags to bring it forward, half a twist at a time.',
			'Recheck draw length and peep rotation afterwards, since both move with cable twists.'
		],
		results: [
			{ observation: 'Top cam hits the stop first', suggests: 'Add twists to the cable that controls the top cam' },
			{ observation: 'Nock travel tips at the shot', suggests: 'Sync the cams before adjusting the rest or the loop' }
		]
	},
	'draw-stop': {
		title: 'Draw length and stops',
		why: 'A compound only shoots the same twice if it stops in the same place twice, which is what the wall is for.',
		steps: [
			'Set the module or post for your draw length.',
			'Draw to the wall and check both stops make contact solidly.',
			'Check the valley feels the same each time: a mushy wall means the stops are not sharing the load.'
		],
		results: [
			{ observation: 'One stop touches first', suggests: 'Sync the cams: this is a timing fault, not a stop fault' },
			{ observation: 'Draw length feels short after twisting cables', suggests: 'Recheck the module setting, then remeasure' }
		]
	},
	'compound-rest': {
		title: 'Rest position and centre shot',
		why: 'On a compound the arrow leaves almost straight, so the rest is where the arrow is aimed rather than where it flexes from.',
		steps: [
			'Set the rest so the arrow sits square to the string, and level with the berger hole centre.',
			'Set the centre shot with a laser or by eye down the string: the shaft slightly outside centre, around 13 mm from the riser on most bows.',
			'Check the launcher blade holds the shaft without contacting the vanes.'
		],
		results: [
			{ observation: 'Paper tear left, right handed', suggests: 'Move the rest right in small steps' },
			{ observation: 'Paper tear right, right handed', suggests: 'Move the rest left in small steps' }
		]
	},
	'd-loop': {
		title: 'D-loop and nock point',
		why: 'The loop sets nock height and how the release pulls the string, which together set the vertical angle of the shot.',
		steps: [
			'Tie the loop so the arrow sits square to the string, or a hair nock high.',
			'Keep the loop short enough that it does not change your draw length noticeably.',
			'Serve it tight: a loop that creeps changes the tune from one week to the next.'
		],
		results: [
			{ observation: 'Tail high tear', suggests: 'Lower the nock point, or raise the rest slightly' },
			{ observation: 'Tail low tear', suggests: 'Raise the nock point, or lower the rest slightly' }
		]
	},
	peep: {
		title: 'Peep height and rotation',
		why: 'A peep that does not come round square makes you aim with your neck, and that shows as vertical error on the target.',
		steps: [
			'Set the height so the peep lands in front of your eye at anchor, with your head upright.',
			'Draw with your eyes closed and open them: the peep should be round and centred without hunting for it.',
			'Fix rotation with string twists, or by serving the peep in place.'
		],
		results: [
			{ observation: 'Peep sits low at anchor', suggests: 'Raise it a few millimetres and reshoot before serving' },
			{ observation: 'Peep turns away at full draw', suggests: 'Adjust string twists, then recheck draw length and cam timing' }
		]
	},
	clearance: {
		title: 'Clearance',
		why: 'A vane brushing a cable or a launcher blade throws an arrow that every other test says is tuned.',
		steps: [
			'Dust the vanes and the rest with foot spray or powder.',
			'Shoot a few arrows and look for contact marks on the vanes, the blade and the cable guard.',
			'Rotate the nock a little at a time until nothing touches.'
		],
		results: [
			{ observation: 'Marks along one vane', suggests: 'Rotate the nock a few degrees and shoot again' },
			{ observation: 'Marks on the cable guard', suggests: 'Check cable clearance and rest travel before nock rotation' }
		]
	},
	'paper-tune': {
		title: 'Paper tuning',
		why: 'Paper shows the attitude of the arrow the instant it leaves, which is the fastest way to see what the rest and the loop are doing.',
		steps: [
			'Stand about two metres from a sheet of paper, with a boss well behind it.',
			'Shoot through the paper with a fletched arrow and read the tear.',
			'Fix vertical first, then horizontal, moving the rest or the loop a millimetre at a time.',
			'Move back to four or five metres and check the tear holds.'
		],
		results: [
			{ observation: 'Tail high tear', suggests: 'Lower the nock point or raise the rest' },
			{ observation: 'Tail low tear', suggests: 'Raise the nock point or lower the rest' },
			{ observation: 'Tail left, right handed', suggests: 'Move the rest right, or check clearance and spine' }
		]
	},
	'walk-back': {
		title: 'Walk-back tuning',
		why: 'It proves the centre shot across distance rather than at one range, which is where a small windage error becomes a large one.',
		steps: [
			'Set a vertical line on the boss with a mark at the top.',
			'Aim at the top mark from close range and shoot, then repeat from progressively longer distances without moving the sight.',
			'The group centres should fall on the line, not drift sideways as you walk back.'
		],
		results: [
			{ observation: 'Arrows drift left as you walk back, right handed', suggests: 'Move the rest right in very small steps' },
			{ observation: 'Arrows drift right as you walk back, right handed', suggests: 'Move the rest left in very small steps' }
		]
	},
	'compound-bare-shaft': {
		title: 'Bare shaft check',
		why: 'The last confirmation: with a compound tuned by paper and walk-back, a bare shaft should agree with the fletched group.',
		steps: [
			'Shoot three fletched arrows and one bare shaft at 15 to 20 metres.',
			'Compare the group centres rather than single arrows.',
			'Accept small differences: a compound with good clearance rarely needs more than this.'
		],
		results: [
			{ observation: 'Bare shaft well left or right', suggests: 'Recheck clearance first, then spine, then rest position' },
			{ observation: 'Bare shaft groups with the fletched', suggests: 'The bow is tuned: record the settings as a revision' }
		]
	},
	'third-axis': {
		title: 'Sight levels and third axis',
		why: 'A level that lies makes you cant the bow on sloping ground, and the arrow lands left or right for a reason nothing on the bow explains.',
		steps: [
			'Level the bow in a vice against a plumb line and set the first and second axes.',
			'Tilt the bow up and down as if shooting uphill: the bubble should stay centred.',
			'Adjust the third axis screw until it does.'
		],
		results: [
			{ observation: 'Bubble runs when aiming uphill', suggests: 'Third axis needs adjusting: it will cost you on field courses' },
			{ observation: 'Groups drift sideways at long range only', suggests: 'Check the level and your cant before touching windage' }
		]
	}
};

const FR: Record<string, StepText> = {
	'limb-alignment': {
		title: 'Alignement des branches',
		why: "Des branches hors du plan d'arc poussent la flèche de côté à chaque tir, et aucun réglage plus bas dans cette liste ne peut le rattraper.",
		steps: [
			"Bandez l'arc et regardez le long de la corde par l'arrière, arc vertical.",
			'La corde doit couper les deux branches en leur milieu et passer au centre de la poignée.',
			"Ajustez les logements de branches : chariots d'alignement sur une poignée récente, vis excentriques sur une plus ancienne.",
			"Revérifiez après chaque modification : déplacer une branche change ce que l'autre semble faire."
		],
		results: [
			{ observation: 'La corde passe à gauche du milieu de la branche', suggests: 'Décalez cette branche vers la droite, par petites touches' },
			{ observation: 'La corde ne semble centrée que sur une branche', suggests: "Alignez d'abord la moins bonne, puis revérifiez les deux" },
			{ observation: "Aucun réglage n'y parvient", suggests: 'Soupçonnez une branche vrillée : passez à l’étape suivante' }
		]
	},
	'limb-twist': {
		title: 'Vrillage des branches',
		why: 'Une branche vrillée ne peut pas être alignée, et toutes les mesures suivantes courent après un défaut qui n’est pas là où il semble.',
		steps: [
			"Bandez l'arc et visez le long de la corde, branches à plat.",
			"Regardez chaque poupée : la gorge de corde doit être d'équerre, sans pencher d'un côté.",
			'Débandez, puis vérifiez que les embases reposent bien à plat dans les logements.',
			"Une branche qui échoue relève de la garantie, pas du réglage."
		],
		results: [
			{ observation: 'Une poupée penche systématiquement', suggests: 'Faites changer la branche plutôt que de compenser' },
			{ observation: "Poupées d'équerre mais alignement toujours faux", suggests: 'Le défaut vient des logements : reprenez l’alignement' }
		]
	},
	'rest-position': {
		title: 'Position du repose-flèche',
		why: "Tout ce que fait la flèche à la décoche part de là où elle repose : on place donc le repose-flèche avant de mesurer quoi que ce soit à partir de lui.",
		steps: [
			"Posez le repose-flèche à son emplacement naturel : la flèche doit passer au-dessus du point de pivot de la poignée.",
			'Réglez la hauteur pour que la flèche soit à peu près horizontale, ou un cheveu au-dessus du centre du bouton.',
			"Collez ou vissez seulement une fois la flèche à sa place."
		],
		results: [
			{ observation: 'La flèche est bien au-dessus du bouton', suggests: 'Abaissez le bras : le bouton doit toucher le centre du tube' },
			{ observation: 'La flèche touche la fenêtre', suggests: 'Remontez le bras jusqu’à dégager le tube' }
		]
	},
	'centre-shot': {
		title: 'Alignement de la flèche (bouton Berger)',
		why: "La direction que prend la flèche à pleine allonge décide de quel côté elle quitte l'arc : c'est précisément ce que le bouton règle.",
		steps: [
			"Bandez l'arc et encochez une flèche sur le repose-flèche.",
			"Regardez le long de la corde, arc vertical : la corde doit couper le tube légèrement vers l'intérieur du centre.",
			"Pour un arc droitier, la pointe se place un ou deux millimètres à gauche de la ligne de corde.",
			'Réglez avec le barillet du bouton, pas avec le repose-flèche.'
		],
		results: [
			{ observation: 'La corde coupe exactement la pointe', suggests: 'Sortez légèrement le bouton pour rentrer la pointe' },
			{ observation: 'Pointe très à l’extérieur de la ligne de corde', suggests: 'Rentrez le bouton : la flèche partira raide sinon' }
		]
	},
	'sight-alignment': {
		title: 'Alignement du viseur',
		why: "Un viseur hors du plan d'arc fait varier la dérive avec la distance, ce qui se lit comme un défaut de flèche alors que ce n'en est pas un.",
		steps: [
			"Placez le viseur pour que l'œilleton se pose sur la ligne de corde, arc bandé.",
			"Faites courir le bloc du haut vers le bas en regardant l'œilleton contre la corde.",
			"L'œilleton doit rester sur la ligne de corde sur toute la course."
		],
		results: [
			{ observation: 'L’œilleton dérive latéralement pendant la course', suggests: "La barre n'est pas parallèle au plan d'arc : calez ou réalignez" },
			{ observation: 'Décalage constant mais course parallèle', suggests: 'Laissez ainsi : votre repère de dérive absorbe un décalage constant' }
		]
	},
	'rest-overhang': {
		title: 'Débordement du repose-flèche',
		why: "Une aiguille qui déborde trop accroche une plume, et une plume accrochée gâche une flèche par ailleurs parfaite.",
		steps: [
			"Regardez de combien l'aiguille passe sous le tube.",
			'Le débordement doit rester inférieur au rayon du tube tiré.',
			'Poudrez les plumes et tirez : rien ne doit marquer le repose-flèche ni la fenêtre.'
		],
		results: [
			{ observation: 'Traces sur l’aiguille', suggests: 'Réduisez le débordement ou tournez l’encoche pour dégager la plume' },
			{ observation: 'Traces sur la fenêtre au-dessus', suggests: 'Vérifiez le point d’encochage et le dégagement avant de toucher au repose-flèche' }
		]
	},
	'brace-height': {
		title: 'Band',
		why: 'Le band fixe la durée pendant laquelle la corde pousse la flèche : le bruit, la sensation et la hauteur du groupement en dépendent.',
		steps: [
			"Mesurez de la corde au point de pivot de la poignée, arc bandé et stabilisé.",
			'Partez de la valeur du fabricant de branches, ou d’un tableau : environ 21 à 22 cm pour un 66 pouces, 23 à 24 cm pour un 70 pouces.',
			'Vrillez la corde pour monter le band, dévrillez pour le baisser, quelques tours à la fois.',
			'Tirez un groupement à chaque valeur et gardez la plus silencieuse et la plus stable.'
		],
		results: [
			{ observation: 'Tir bruyant et sec', suggests: 'Montez le band de quelques tours de corde' },
			{ observation: 'Flèches molles, sans vie', suggests: 'Baissez le band de quelques tours de corde' },
			{ observation: 'La corde claque le bras', suggests: 'Montez le band, puis vérifiez la rotation de votre bras d’arc' }
		]
	},
	tiller: {
		title: 'Tiller',
		why: "Le tiller équilibre le travail des deux branches face à une main qui tient la corde sous son milieu : c'est ce qui garde l'encoche sur une trajectoire droite.",
		steps: [
			"Mesurez de la corde à la jonction de chaque branche avec la poignée, perpendiculairement à la branche.",
			'Soustrayez la valeur du bas à celle du haut : cette différence est le tiller.',
			'Partez d’environ +0,6 cm pour un classique avec viseur, et d’environ 0 pour un arc nu.',
			'Modifiez-le aux vis de branches, en gardant la puissance en tête : serrer augmente la force.'
		],
		results: [
			{ observation: 'Flèche non empennée toujours haute', suggests: 'Augmentez légèrement le tiller, ou baissez d’abord le point d’encochage' },
			{ observation: 'Flèche non empennée toujours basse', suggests: 'Réduisez légèrement le tiller, ou montez d’abord le point d’encochage' },
			{ observation: "L'arc saute bizarrement à la décoche", suggests: 'Revenez au tiller de départ et refaites le point d’encochage' }
		]
	},
	'nocking-point': {
		title: 'Point d’encochage',
		why: "Le point d'encochage fixe l'angle vertical de sortie : mal placé, il se traduit par une dispersion verticale que personne ne tire proprement.",
		steps: [
			"Posez une équerre d'arc sur le repose-flèche et clipsez-la sur la corde.",
			'Placez le haut du nock-set inférieur à environ 0,5 cm au-dessus de l’équerre pour commencer.',
			'Ajoutez le second nock-set au-dessus de l’encoche pour que la flèche ne glisse pas.',
			'Validez à la flèche non empennée à courte distance une fois le reste de la géométrie posé.'
		],
		results: [
			{ observation: 'Flèche non empennée haute', suggests: 'Montez le point d’encochage' },
			{ observation: 'Flèche non empennée basse', suggests: 'Descendez le point d’encochage' },
			{ observation: 'La flèche non empennée marsouine', suggests: 'Le point est loin du compte : corrigez par pas plus grands' }
		]
	},
	'draw-length': {
		title: 'Allonge',
		why: 'La longueur des tubes et le spine découlent de cette valeur : on la mesure donc une fois, correctement, avant de couper quoi que ce soit.',
		steps: [
			'Armez et ancrez comme vous tirez, avec une flèche de mesure longue.',
			'Relevez la distance de la gorge de corde au point de pivot, puis ajoutez 1,75 pouce pour l’allonge normalisée.',
			'Refaites la mesure trois fois, à des jours différents : elle bouge avec la technique.',
			'Gardez des tubes assez longs pour dépasser le repose-flèche à pleine allonge, avec une marge.'
		],
		results: [
			{ observation: 'La valeur varie de plus d’un centimètre', suggests: 'La technique n’est pas stabilisée : remesurez avant de couper' },
			{ observation: 'La pointe atteint le repose-flèche à pleine allonge', suggests: 'Les tubes sont trop courts : question de sécurité, changez-les' }
		]
	},
	'arrow-spine': {
		title: 'Choisir la flèche : spine et poids de pointe',
		why: "Tout ce qui précède règle l'arc ; cette étape choisit la flèche qui lui correspond. Un tube inadapté ne se règle pas, il se compense, jusqu'à ce qu'autre chose cloche.",
		steps: [
			'Prenez la puissance réellement ressentie aux doigts à votre allonge, pas celle marquée sur les branches.',
			'Lisez un tableau de spine avec cette puissance, la longueur de vos tubes et le poids de pointe.',
			'Préférez le tableau publié par le fabricant de vos tubes.',
			'Jouez sur le poids de pointe pour déplacer le spine dynamique : plus lourd assouplit.'
		],
		results: [
			{ observation: 'La flèche non empennée part toujours faible', suggests: 'Pointe plus légère, tube plus court, ou spine plus raide' },
			{ observation: 'La flèche non empennée part toujours raide', suggests: 'Pointe plus lourde, tube plus long, ou spine plus souple' },
			{ observation: 'FOC inférieur à 10 %', suggests: 'Alourdissez la pointe : la flèche se tiendra mal dans le vent' }
		]
	},
	'bare-shaft': {
		title: "Valider l'ensemble aux flèches non empennées",
		why: "La dernière étape, et la seule qui éprouve l'arc et la flèche ensemble : sans empennage, le tir montre ce qu'il fait réellement et vous renvoie au bouton ou au point d'encochage avec une réponse.",
		steps: [
			'Tirez trois flèches empennées et une non empennée sur le même point, à 10 ou 15 mètres.',
			'Notez la position du tube nu par rapport au groupement empenné.',
			'Corrigez d’abord le vertical au point d’encochage, puis le latéral au bouton.',
			'Ne changez qu’une chose à la fois, puis retirez la série.'
		],
		results: [
			{ observation: 'Flèche non empennée à gauche du groupement, droitier', suggests: 'Réaction raide : assouplissez le ressort ou alourdissez la pointe' },
			{ observation: 'Flèche non empennée à droite du groupement, droitier', suggests: 'Réaction faible : durcissez le ressort ou allégez la pointe' },
			{ observation: 'Flèche non empennée haute ou basse', suggests: 'Corrigez le point d’encochage avant toute correction latérale' }
		]
	},

	'spec-check': {
		title: 'Vérifier l’arc face à sa fiche',
		why: "Un poulies est une mécanique construite sur des cotes : si l'entraxe et le band s'en écartent, quelque chose a bougé et le réglage ne tiendra pas.",
		steps: [
			'Mesurez l’entraxe et le band, arc au repos.',
			'Comparez aux valeurs publiées par le fabricant pour ce modèle et cette allonge.',
			'Un écart vient le plus souvent de câbles ou de corde qui se sont allongés, ou d’une vis de branche qui a bougé.'
		],
		results: [
			{ observation: 'Entraxe long et band court', suggests: 'Corde et câbles ont fatigué : revrillez-les à la cote' },
			{ observation: 'Tout est faux avec une corde neuve', suggests: 'Vérifiez l’égalité des vis de branches, puis faites presser l’arc' }
		]
	},
	'cam-sync': {
		title: 'Synchronisation des cames',
		why: "Des cames qui n'arrivent pas au mur ensemble font basculer l'encoche à la sortie, et aucun repose-flèche ne rattrape cela.",
		steps: [
			'Armez sur presse ou machine, ou faites-vous observer pendant l’armement.',
			'Regardez les deux cames atteindre leurs butées : elles doivent arriver ensemble.',
			'Vrillez le câble en retard pour l’avancer, un demi-tour à la fois.',
			'Revérifiez ensuite allonge et rotation du viseur de corde : les deux bougent avec les vrillages.'
		],
		results: [
			{ observation: 'La came du haut arrive la première', suggests: 'Ajoutez des tours au câble qui commande la came du haut' },
			{ observation: 'L’encoche bascule au départ', suggests: 'Synchronisez avant de toucher au repose-flèche ou au D-loop' }
		]
	},
	'draw-stop': {
		title: 'Allonge et butées',
		why: "Un poulies ne tire deux fois pareil que s'il s'arrête deux fois au même endroit : c'est le rôle du mur.",
		steps: [
			'Réglez le module ou la butée à votre allonge.',
			'Armez jusqu’au mur et vérifiez que les deux butées portent franchement.',
			'La vallée doit être identique à chaque armement : un mur mou signale des butées qui ne partagent pas la charge.'
		],
		results: [
			{ observation: 'Une butée touche en premier', suggests: 'Synchronisez les cames : le défaut vient du calage, pas des butées' },
			{ observation: 'Allonge trop courte après vrillage des câbles', suggests: 'Revoyez le réglage du module, puis remesurez' }
		]
	},
	'compound-rest': {
		title: 'Repose-flèche et alignement',
		why: "Sur un poulies la flèche part presque droite : le repose-flèche est donc une direction de visée plus qu'un point de flexion.",
		steps: [
			'Placez le repose-flèche pour que la flèche soit d’équerre à la corde, au centre du trou de berger.',
			'Réglez l’alignement au laser ou à l’œil : tube légèrement à l’extérieur du centre, environ 13 mm de la poignée sur la plupart des arcs.',
			'Vérifiez que la lame tient le tube sans toucher les plumes.'
		],
		results: [
			{ observation: 'Déchirure papier à gauche, droitier', suggests: 'Décalez le repose-flèche vers la droite, par petits pas' },
			{ observation: 'Déchirure papier à droite, droitier', suggests: 'Décalez le repose-flèche vers la gauche, par petits pas' }
		]
	},
	'd-loop': {
		title: 'D-loop et encochage',
		why: "Le D-loop fixe la hauteur d'encochage et la façon dont le décocheur tire la corde : ensemble, elles donnent l'angle vertical du tir.",
		steps: [
			'Nouez le D-loop pour que la flèche soit d’équerre à la corde, ou un cheveu au-dessus.',
			'Gardez-le assez court pour ne pas changer sensiblement votre allonge.',
			'Serrez-le fermement : un D-loop qui glisse change le réglage d’une semaine à l’autre.'
		],
		results: [
			{ observation: 'Déchirure queue haute', suggests: 'Baissez le point d’encochage, ou remontez légèrement le repose-flèche' },
			{ observation: 'Déchirure queue basse', suggests: 'Montez le point d’encochage, ou baissez légèrement le repose-flèche' }
		]
	},
	peep: {
		title: 'Viseur de corde : hauteur et rotation',
		why: "Un viseur de corde qui ne revient pas droit vous fait viser avec la nuque, et cela se lit en dispersion verticale sur la cible.",
		steps: [
			'Réglez la hauteur pour que le viseur tombe devant l’œil à l’ancrage, tête droite.',
			'Armez les yeux fermés puis ouvrez-les : le viseur doit être rond et centré sans le chercher.',
			'Corrigez la rotation par vrillage de corde, ou en le tranche-filant en place.'
		],
		results: [
			{ observation: 'Viseur trop bas à l’ancrage', suggests: 'Montez-le de quelques millimètres et retirez avant de tranche-filer' },
			{ observation: 'Le viseur tourne à pleine allonge', suggests: 'Ajustez les vrillages, puis revérifiez allonge et synchronisation' }
		]
	},
	clearance: {
		title: 'Dégagement',
		why: "Une plume qui frôle un câble ou une lame gâche une flèche que tous les autres tests déclarent réglée.",
		steps: [
			'Poudrez les plumes et le repose-flèche.',
			'Tirez quelques flèches et cherchez les traces sur les plumes, la lame et le garde-câble.',
			'Tournez l’encoche par petits angles jusqu’à ce que plus rien ne touche.'
		],
		results: [
			{ observation: 'Traces le long d’une plume', suggests: 'Tournez l’encoche de quelques degrés et retirez' },
			{ observation: 'Traces sur le garde-câble', suggests: 'Vérifiez le dégagement des câbles et la course du repose-flèche' }
		]
	},
	'paper-tune': {
		title: 'Réglage au papier',
		why: "Le papier montre l'attitude de la flèche à l'instant où elle part : c'est le moyen le plus rapide de voir ce que font le repose-flèche et le D-loop.",
		steps: [
			'Placez-vous à environ deux mètres d’une feuille, avec une cible bien derrière.',
			'Tirez à travers le papier avec une flèche empennée et lisez la déchirure.',
			'Corrigez le vertical d’abord, puis le latéral, au millimètre.',
			'Reculez à quatre ou cinq mètres et vérifiez que la déchirure tient.'
		],
		results: [
			{ observation: 'Déchirure queue haute', suggests: 'Baissez le point d’encochage ou montez le repose-flèche' },
			{ observation: 'Déchirure queue basse', suggests: 'Montez le point d’encochage ou baissez le repose-flèche' },
			{ observation: 'Déchirure à gauche, droitier', suggests: 'Décalez le repose-flèche à droite, ou vérifiez dégagement et spine' }
		]
	},
	'walk-back': {
		title: 'Réglage en reculant',
		why: "Il valide l'alignement sur plusieurs distances plutôt qu'à une seule, là où une petite erreur de dérive en devient une grande.",
		steps: [
			'Tracez une verticale sur la cible avec un repère en haut.',
			'Visez le repère de près et tirez, puis recommencez de plus en plus loin sans toucher au viseur.',
			'Les centres de groupement doivent rester sur la ligne, sans dériver.'
		],
		results: [
			{ observation: 'Dérive à gauche en reculant, droitier', suggests: 'Décalez le repose-flèche vers la droite, très légèrement' },
			{ observation: 'Dérive à droite en reculant, droitier', suggests: 'Décalez le repose-flèche vers la gauche, très légèrement' }
		]
	},
	'compound-bare-shaft': {
		title: 'Contrôle à la flèche non empennée',
		why: "La confirmation finale : sur un poulies réglé au papier et en reculant, le tube nu doit rejoindre le groupement empenné.",
		steps: [
			'Tirez trois flèches empennées et une non empennée à 15 ou 20 mètres.',
			'Comparez les centres de groupement plutôt que des flèches isolées.',
			'Acceptez de petits écarts : un poulies au dégagement propre ne demande guère plus.'
		],
		results: [
			{ observation: 'Flèche non empennée franchement à gauche ou à droite', suggests: 'Vérifiez le dégagement, puis le spine, puis le repose-flèche' },
			{ observation: 'Flèche non empennée dans le groupement', suggests: 'L’arc est réglé : enregistrez les valeurs comme révision' }
		]
	},
	'third-axis': {
		title: 'Niveaux du viseur et troisième axe',
		why: "Un niveau qui ment vous fait incliner l'arc en terrain pentu, et la flèche part à gauche ou à droite sans que rien sur l'arc ne l'explique.",
		steps: [
			'Mettez l’arc d’aplomb en étau contre un fil à plomb et réglez les premier et deuxième axes.',
			'Inclinez l’arc vers le haut et vers le bas comme pour un tir en pente : la bulle doit rester centrée.',
			'Ajustez la vis de troisième axe jusqu’à ce que ce soit le cas.'
		],
		results: [
			{ observation: 'La bulle fuit en visant vers le haut', suggests: 'Le troisième axe est à reprendre : il coûte cher en parcours' },
			{ observation: 'Dérive latérale aux longues distances seulement', suggests: 'Vérifiez le niveau et votre inclinaison avant de toucher la dérive' }
		]
	}
};

const TEXT: Record<Locale, Record<string, StepText>> = { en: EN, fr: FR };

export function stepsFor(bow: GuideBow): GuideStep[] {
	return GUIDE_STEPS.filter((step) => step.bow === bow);
}

/** English is the fallback: a step with no translation yet is better read than missing. */
export function stepText(key: string, locale: Locale): StepText {
	return TEXT[locale]?.[key] ?? EN[key];
}
