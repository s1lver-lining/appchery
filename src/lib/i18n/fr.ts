import type { Dictionary } from './index';

export const fr: Dictionary = {
	app: {
		name: 'Appchery',
		tagline: 'Scores et entraînement en tir à l\'arc',
		exitTitle: 'Fermer Appchery ?',
		exitBody: 'Tout est déjà enregistré sur cet appareil.',
		exitAction: 'Fermer'
	},
	// The poster that hands the app to somebody else: the address of the app, as a code.
	invite: {
		title: 'Partager',
		print: 'Imprimer',
		scan: 'Scannez le code, ou tapez l’adresse',
		body: 'Appchery garde vos scores, vos séances et les réglages de vos arcs sur votre téléphone. Le compte est facultatif, et rien ne quitte le téléphone sans lui. Rien à payer.',
		free: 'Libre et open source, sous licence AGPL.'
	},
	nav: {
		home: 'Accueil',
		sessions: 'Séances',
		equipment: 'Matériel',
		stats: 'Statistiques',
		settings: 'Paramètres'
	},
	common: {
		start: 'Commencer',
		cancel: 'Annuler',
		save: 'Enregistrer',
		add: 'Ajouter',
		delete: 'Supprimer',
		back: 'Retour',
		undo: 'Annuler',
		done: 'Terminé',
		close: 'Fermer',
		loading: 'Chargement…',
		optional: 'facultatif',
		today: "Aujourd'hui",
		tomorrow: 'Demain',
		more: 'Plus',
		hour: 'Heure',
		minute: 'Minute',
		dayPeriod: 'AM ou PM'
	},
	sessions: {
		title: 'Séances',
		empty: 'Aucune séance. Commencez-en une, puis ajoutez-y des activités.',
		new: 'Nouvelle séance',
		listTab: 'Liste',
		calendarTab: 'Calendrier',
		view: 'Vue',
		search: 'Rechercher une séance',
		noMatch: 'Aucun résultat pour cette recherche.',
		week: 'Semaine {n}',
		noneThisMonth: 'Rien de tiré ce mois-ci.',
		dayCount: '{n} séances',
		open: 'Ouvrir la séance',
		finish: 'Terminer la séance',
		name: {
			practice: {
				morning: 'Séance du matin',
				afternoon: "Séance de l'après-midi",
				evening: 'Séance du soir',
				night: 'Séance de nuit'
			},
			competition: {
				morning: 'Compétition du matin',
				afternoon: "Compétition de l'après-midi",
				evening: 'Compétition du soir',
				night: 'Compétition de nuit'
			}
		},
		newCompetition: 'Nouvelle compétition',
		moreKinds: 'Autres types de séance',
		newPlanned: 'Planifier une séance',
		jumpTo: 'Aller à',
		prevMonth: 'Mois précédent',
		nextMonth: 'Mois suivant',
		month: 'Mois',
		year: 'Année',
		thisMonth: 'Ce mois-ci',
		arrowGoal: '{n} à tirer',
		planned: 'Planifiée',
		showWeekGoal: "Afficher l'objectif hebdomadaire",
		hideWeekGoal: "Masquer l'objectif hebdomadaire",
		activityCount: '{n} act.',
		arrows: 'flèches',
		oneActivity: '1 act.',
		practice: 'Entraînement',
		competition: 'Compétition',
		qualification: 'Qualification',
		/* Utilisés là où le nom complet ne tient pas, comme sur les filtres des statistiques. */
		practiceShort: 'Entr.',
		competitionShort: 'Compét.',
		qualificationShort: 'Qualif.'
	},
	session: {
		bow: 'Arc',
		pickBow: 'Choisir un arc',
		noBow: 'Non renseigné',
		genericBow: "Type d'arc générique",
		myBows: 'Mes arcs',
		conditions: 'Conditions',
		location: 'Lieu',
		place: 'Lieu',
		fetchConditions: 'Récupérer le lieu et la météo',
		fetching: 'Récupération…',
		locationDenied: "L'autorisation de localisation est requise pour récupérer les conditions.",
		locationOff:
			'La localisation est désactivée. Activez « Enregistrer le lieu » dans les réglages.',
		weatherFailed: 'Météo indisponible. Le lieu a tout de même été enregistré.',
		activities: 'Activités',
		overviewTab: 'Aperçu',
		settingsTab: 'Réglages',
		weather: 'Météo',
		weatherNone: 'Non enregistrée',
		weatherOff: "L'enregistrement de la météo est désactivé. Activez-le dans les paramètres.",
		noConditions: 'Rien enregistré pour cette séance.',
		arrowsShot: 'Flèches tirées',
		trainingArrows: "Flèches d'entraînement",
		oneLess: 'Une de moins',
		customArrows: 'Ajouter des flèches',
		notes: 'Notes',
		notesHint: 'Le vent, ce que vous avez réglé, les sensations.',
		setGoal: 'Définir un objectif',
		goalTitle: 'Objectif de flèches',
		goalHint: 'Le nombre de flèches que cette séance doit compter.',
		goalLeft: '{n} restantes',
		goalReached: 'Objectif atteint.',
		removeGoal: 'Retirer',
		when: 'Date et heure',
		date: 'Date',
		time: 'Heure',
		days: 'j',
		addActivity: 'Ajouter une activité',
		searchActivity: 'Rechercher un tir ou une procédure',
		scoringGroup: 'Tir compté',
		recentGroup: 'Tirés récemment',
		delete: 'Supprimer cette séance',
		confirmTitle: 'Supprimer cette séance ?',
		confirmBody: 'Toutes ses activités sont supprimées également. Action irréversible.',
		noActivities: 'Aucune activité.',
		addScoring: 'Ajouter une activité de score',
		addTuning: 'Ajouter une activité de réglage'
	},
	bow: {
		recurve: 'Classique',
		compound: 'Poulies',
		barebow: 'Arc nu',
		longbow: 'Longbow'
	},
	bowName: {
		recurve: 'Arc classique',
		compound: 'Arc à poulies',
		barebow: 'Arc nu',
		longbow: 'Longbow'
	},
	empty: {
		sample: 'Exemple',
		sessions: {
			title: 'Aucune sortie',
			body: 'À chaque fois que vous tirez, ouvrez une séance ici. Elle garde la date, le lieu, la météo et l’arc pour vous.'
		},
		activities: {
			title: 'Rien de tiré dans cette sortie',
			body: 'Ajoutez un tir pour marquer flèche par flèche, un match pour affronter quelqu’un, ou un réglage.'
		},
		stats: {
			title: 'Aucun tir à analyser',
			body: 'Terminez un tir et cette page se met à le comparer : votre moyenne, votre record, et comment tout cela évolue.'
		},
		plans: {
			title: 'Aucun programme',
			body: 'Un programme est une semaine que vous comptez répéter. La liste des séances montre alors ce que chaque semaine attend de vous.'
		},
		equipment: {
			title: 'Aucun arc enregistré',
			body: 'Ajoutez l’arc que vous tirez : l’app garde ses réglages, ses repères de viseur et tout ce qui a été tiré avec.'
		}
	},
	undo: {
		action: 'Annuler',
		sessionDeleted: 'Séance supprimée',
		activityDeleted: 'Activité supprimée',
		matchDeleted: 'Match supprimé',
		sessionsDeleted: '{n} séances supprimées',
		activitiesDeleted: '{n} activités retirées'
	},
	leave: {
		discard: 'Abandonner',
		bowTitle: 'Réglages non enregistrés',
		bowBody: 'Cet arc a {n} modifications qui ne font encore partie d’aucune révision.',
		tuningTitle: 'Réglage non enregistré',
		tuningBody: 'Ce test a {n} réglages qui n’ont pas encore été appliqués à l’arc.'
	},
	select: {
		count: '{n} sélectionnées',
		all: 'Tout sélectionner',
		none: 'Tout désélectionner',
		changeBow: 'Changer d’arc',
		deleteAll: 'Tout supprimer',
		removeAll: 'Tout retirer',
		bowTitle: 'Arc des séances sélectionnées',
		deleteTitle: 'Supprimer les séances sélectionnées ?',
		deleteBody: '{n} séances, avec tout ce qui y est consigné.',
		removeTitle: 'Retirer les activités sélectionnées ?',
		removeBody: '{n} activités, avec les flèches qui y sont marquées.'
	},
	timer: {
		title: 'Chronomètre',
		start: 'Appeler la ligne',
		stop: 'Arrêter',
		reset: 'Réinitialiser',
		nextTurn: 'Tour suivant',
		turn: 'Tour {n}',
		resetTimes: 'Revenir aux règles',
		edit: 'Modifier les temps',
		ruleTime: 'World Archery : {time}',
		seconds: 'sec',
		preparation: 'Préparation',
		volume: 'Volume',
		preparationHint: 'Entre l’appel sur la ligne et le départ.',
		times: 'Temps de tir',
		preset: {
			qualification6: 'Qualification, six flèches',
			qualification3: 'Qualification, trois flèches',
			match3: 'Match, trois flèches',
			team6: 'Équipe, six flèches',
			mixed4: 'Équipe mixte, quatre flèches',
			alternating: 'Alterné, une flèche'
		},
		soundTitle: 'Jouer les signaux',
		soundHint: 'Deux coups pour venir sur la ligne, un pour commencer, trois pour ramasser. Synthétisés sur l’appareil, non enregistrés.',
		signal: {
			lineUp: 'Venir sur la ligne',
			start: 'Commencer',
			end: 'Ramasser les flèches',
			stop: 'Arrêter le tir'
		},
		signalHint: 'Touchez un signal pour l’entendre. Cinq coups ou plus veut dire tout arrêter.'
	},
	match: {
		group: 'Match',
		title: 'Match',
		format: {
			individual: 'Individuel',
			team: 'Équipe',
			mixedTeam: 'Équipe mixte',
			custom: 'Match personnalisé'
		},
		formatHint: {
			individual: 'Cinq sets de trois flèches, en six points de set.',
			team: 'Quatre volées de six flèches, en cinq points de set.',
			mixedTeam: 'Quatre volées de quatre flèches, en cinq points de set.',
			custom: 'Choisissez les volées, les flèches et la façon de gagner.'
		},
		winCondition: 'Condition de victoire',
		system: { set: 'Points de set', cumulative: 'Score total' },
		botTitle: 'Jouer contre un bot',
		botName: 'Bot ({level})',
		bot: {
			beginner: 'Débutant',
			amateur: 'Amateur',
			advanced: 'Confirmé',
			professional: 'Professionnel'
		},
		bracket: 'Tableau',
		stageLabel: 'Tour',
		stage: {
			none: 'Hors tableau',
			r64: '1/32',
			r32: '1/16',
			r16: '1/8',
			quarter: 'Quart de finale',
			semi: 'Demi-finale',
			bronze: 'Bronze',
			final: 'Finale'
		},
		ourSide: 'Notre côté',
		opponent: 'Adversaire',
		teammates: 'Coéquipiers',
		teammate: 'Archer {n}',
		forOtherTitle: 'Marquer pour quelqu’un d’autre',
		forOtherHint: 'Les flèches de cette feuille ne sont pas les vôtres : rien ici ne compte dans votre volume ni dans vos badges.',
		face: 'Blason',
		faceSize: 'Taille (cm)',
		arrowsPerEnd: 'Flèches',
		ends: 'Volées',
		setPoints: 'Points pour gagner',
		advanced: 'Plus d’options',
		allowShootOff: 'Autoriser un barrage',
		start: 'Commencer le match',
		end: 'Volée {n}',
		shootOff: 'Barrage',
		sets: 'Sets',
		total: 'Total',
		whoWon: 'Qui remporte le barrage ?',
		weWon: 'Nous',
		theyWon: 'Eux',
		undecided: 'En attente du juge',
		won: 'Gagné',
		lost: 'Perdu',
		drawn: 'Match nul',
		inProgress: 'En cours',
		against: 'contre {name}',
		unrecorded: 'Non comptabilisé',
		deleteEnd: 'Effacer cette volée',
		noArrows: 'Totaux seuls'
	},
	round: {
		yourBest: 'Record {n}',
		lastShot: 'Dernier tir {when}',
		discipline: {
			target: 'Cible',
			field: 'Campagne',
			'3d': '3D',
			clout: 'Clout',
			custom: 'Libre'
		},
		arrows: '{n} flèches',
		endsOf: '{ends} volées de {arrows}',
		face: 'blason {size} cm',
		unmarked: 'Distance inconnue',
		unverifiedShort: 'Non vérifié',
		unverified:
			"Le barème de ce tir n'a pas encore été vérifié avec le règlement en vigueur. Vérifiez les valeurs avant de vous fier à un résultat.",
		max: 'Max {n}',
		custom: 'Tir personnalisé',
		customTitle: 'Tir personnalisé',
		customHint: 'Paramètres manuels',
		ends: 'Volées',
		arrowsPerEnd: 'Flèches par volée',
		faceSize: 'Diamètre du blason (cm)',
		distance: 'Distance',
		unit: 'Unité',
		name: 'Nom',
		create: 'Créer et commencer'
	},
	score: {
		end: 'Volée {n}',
		endOf: 'Volée {n} sur {total}',
		endColumn: 'Vol.',
		arrowsColumn: 'Flèches',
		endTotalShort: 'T/V',
		endTotalLong: 'Total de la volée',
		total: 'Total',
		runningTotalLong: 'Total cumulé',
		arrow: 'Flèche',
		miss: 'M',
		tens: '10',
		xs: 'X',
		average: 'Moyenne par flèche',
		tapToScore: 'Touchez une valeur pour chaque flèche.',
		plotMode: 'Sur le blason',
		byNumber: 'Au clavier',
		editing: "Modification d'une flèche",
		undoEnd: 'Annuler volée',
		group: 'Groupement',
		groupCentre: 'Décalage du centre',
		meanRadius: 'Rayon moyen',
		plottedArrows: '{n} pointées',
		smallSample: 'Trop peu de flèches pointées pour que ces chiffres soient significatifs.',
		plotHint: "Touchez l'impact, ou maintenez et déplacez avant de relâcher.",
		movePlot: 'La flèche entourée est celle que vous déplacez : replacez-la.',
		placePlot: "Cette flèche n'a pas encore de position : placez-la où elle a touché.",
		noPlots: "Aucune flèche n'a été pointée sur le blason pour cette volée.",
		editArrow: 'Modifier la flèche {n} de la volée {end}',
		groupSize: 'Taille du groupement',
		arrowNumbers: 'Numéroter les flèches',
		arrowNumbersHint: 'Marque chaque flèche de son ordre de saisie, ce qui permet de les distinguer une fois triées.',
		arrowNumberChart: 'Score moyen par numéro de flèche',
		arrowNumberOf: 'Flèche {n}, sur {arrows} tirées',
		arrowNumberFloor: 'Les barres partent de {n}, pas de zéro.',
		driftTitle: 'La flèche {n} sort peut-être du lot',
		driftBody:
			'La flèche {n} est tombée {direction} de vos autres flèches {shots} fois de suite. Vérifiez la rectitude du tube, son encoche et son empennage, ou retirez-la en la suivant des yeux.',
		driftDirection: {
			high: 'au-dessus',
			highRight: 'en haut à droite',
			right: 'à droite',
			lowRight: 'en bas à droite',
			low: 'en dessous',
			lowLeft: 'en bas à gauche',
			left: 'à gauche',
			highLeft: 'en haut à gauche'
		},
		driftDismiss: 'Masquer pour le moment',
		driftIgnore: 'Masquer pour ce tir',
		sortArrows: 'Trier les flèches par ordre décroissant',
		sortArrowsHint:
			"Affiche chaque volée dans l'ordre de la feuille de marque plutôt que dans l'ordre de saisie.",
		roundComplete: 'Tir terminé. Les flèches restent modifiables.'
	},
	activity: {
		delete: 'Supprimer cette activité',
		confirmTitle: 'Supprimer cette activité ?',
		confirmBody: 'Ses volées et ses flèches sont supprimées avec elle. Action irréversible.'
	},
	weather: {
		sun: 'Dégagé',
		cloud: 'Nuageux',
		rain: 'Pluie',
		snow: 'Neige',
		fog: 'Brouillard',
		storm: 'Orage'
	},
	ratio: {
		title: 'Rapport poids / puissance',
		mass: "Poids de l'arc",
		drawWeight: 'Puissance',
		unit: 'g/lb',
		fromIdeal: 'de 70',
		hint: "Pesez l'arc tel que vous le tirez, puis mesurez sa puissance au peson.",
		verdict: {
			good: "Le compte y est : l'arc porte bien son poids.",
			fair: 'Un peu à côté, mais tirable. Un changement de masse de stabilisation se justifie.',
			poor: "Loin du compte : l'arc paraîtra mort, ou impossible à tenir à pleine allonge."
		}
	},
	brace: {
		title: 'Bands essayés',
		hint: 'Ajoutez un band, tirez une volée ou deux, puis vrillez la corde et passez au suivant.',
		face: 'Blason',
		centre: 'Hauteur',
		spread: 'Groupement',
		arrows: '{n} flèches',
		end: 'Volée {n} · {arrows}',
		addEnd: '+ Volée',
		addBrace: 'Ajouter un band',
		newPlaceholder: 'Band en cm',
		tightest: 'Plus groupé',
		plotTitle: 'Band {brace} cm',
		plotHint: 'Touchez le blason à l’endroit de chaque impact.',
		chartEmpty: 'Tirez une volée à au moins deux bands pour voir les courbes.',
		chartLabel: 'Hauteur et taille du groupement selon le band',
		chartUnits: 'Hauteur à gauche, taille du groupement à droite, en cm',
		chartAxis: 'Band (cm)',
		centreSeries: 'Hauteur du groupement',
		spreadSeries: 'Taille du groupement',
		exampleTitle: 'À quoi ressemble un bon test',
		exampleHint: 'Les deux courbes culminent au band à conserver : le groupement se resserre en montant.',
		tableTitle: 'Où commencer, selon la taille d’arc',
		tableHint:
			'Pour une poignée de 25 pouces. Une plage de départ, pas un réglage : le réglage fin se tire.',
		tableBow: 'Arc',
		tableMin: 'Mini',
		tableMax: 'Maxi'
	},
	tuning: {
		title: 'Réglages',
		guideTitle: 'Étapes de réglage',
		guideShort: 'Étapes',
		diagram: {
			equalGaps: 'écarts égaux',
			limbAligned: 'La corde partage les deux cales',
			limbGauge: "cale d'alignement",
			limbOffPlane: 'Branche hors du plan',
			stringLine: 'corde',
			button: 'bouton',
			maxOutside: 'Au plus 1 à 2 mm hors du plan',
			upper: 'haut',
			lower: 'bas',
			tillerFormula: 'tiller = haut − bas',
			tillerTarget: 'Tiller conseillé = 0,6 cm',
			nockToPivot: 'Fond d’encoche au point pivot',
			amoLength: 'Allonge normalisée AMO',
			amoFormula: 'AMO = mesure + 1,75"',
			atNockingPoint: 'Peson au point d’encochage',
			atYourDraw: 'Mesuré à votre propre allonge',
			braceLabel: 'band',
			gripThroat: 'Équerre sur le point pivot, lecture sur la corde',
			sightAligned: 'Œilleton sur la corde, en haut et en bas',
			sightTop: 'Décalé en haut',
			sightBottom: 'Décalé en bas',
			aboutHalf: 'environ 0,5 cm',
			squareOnRest: 'Équerre sur le repose-flèche',
			stiff: 'flèche trop raide',
			weak: 'flèche trop souple',
			nockLow: 'point d’encochage trop bas',
			nockHigh: 'point d’encochage trop haut',
			tailHigh: 'queue haute',
			tailLow: 'queue basse',
			tailLeft: 'queue à gauche',
			plungerIn: 'sortir le berger',
			plungerOut: 'rentrer le berger',
			springStiff: 'trop dur',
			springSoft: 'trop souple',
			pressureOk: 'pression correcte',
			forRight: 'Lecture pour un arc droitier',
			forLeft: 'Lecture pour un arc gaucher',
			ringClimbs: 'La visée monte',
			ringFalls: 'La visée descend',
			groupTight: 'groupé et haut',
			groupMiddling: 'intermédiaire',
			groupLoose: 'dispersé et bas',
			tailRight: 'queue à droite'
		},
		guideHint:
			'L’ordre dans lequel on règle un arc. Chaque étape suppose les précédentes déjà justes.',
		askHand: 'De quelle main tirez-vous ?',
		askHandHint: 'Cette étape se lit à l’envers sur l’autre arc. Demandé une fois, puis retenu.',
		hand: {
			right: 'Droitier',
			left: 'Gaucher'
		},
		guideCategory: {
			measure: 'Mesures',
			setup: 'Montage',
			presetting: 'Pré-réglage',
			arrows: 'Flèches',
			fine: 'Réglage fin'
		},
		guideCredit:
			'Ordre du classique d’après Claude Cangelosi, Guide des réglages d’un arc. Textes de nous.',
		startNamed: 'Commencer : {name}',
		needBow: 'Choisissez un arc par défaut pour lancer un réglage depuis cette page.',
		applyTitle: 'Appliquer le réglage',
		applyHint:
			"Modifiez ce que vous avez réellement ajusté. Enregistrer crée une révision de l'arc liée à ce test.",
		apply: "Enregistrer comme révision de l'arc",
		applied: "Ce test a produit une révision de l'arc.",
		viewHistory: "Voir l'historique de l'arc",
		steps: 'Étapes',
		/** The tuning procedures by key, so a French archer reads a French name for the one they ran. */
		template: {
			'brace-height': 'Réglage du band',
			'bare-shaft': 'Réglage aux flèches non empennées',
			'paper-tune': 'Réglage au papier',
			'walk-back': 'Réglage en reculant',
			'weight-ratio': 'Rapport poids / puissance'
		},
		noSettings:
			"Ce test ne modifie aucun réglage enregistré pour l'arc : il vit dans les notes.",
		interpretation: 'Ce que le résultat suggère',
		notes: 'Notes',
		notesHint: 'Ce que vous avez observé, et ce que vous avez modifié.',
		start: 'Commencer',
		noBowSelected:
			"Choisissez d'abord un arc dans la séance, ou définissez un arc par défaut dans la liste du matériel pour qu'il soit ajouté à chaque nouvelle séance.",
		forBow: 'Étapes de réglage pour {bow}',
		sessionLabel: 'Réglages {bow}'
	},
	equipment: {
		title: 'Liste du matériel',
		empty: 'Aucun arc. Ajoutez-en un pour suivre ses réglages et son historique.',
		addBow: 'Ajouter un arc',
		bowName: 'Nom',
		nameRequired: 'Un nom est nécessaire.',
		bowType: 'Type',
		makeDefault: 'En faire mon arc par défaut',
		makeDefaultHint: 'Chaque nouvelle séance démarre dessus, et l’onglet matériel l’ouvre.',
		tuningSteps: 'Réglages',
		overviewTab: 'Aperçu',
		settingsTab: 'Réglages',
		default: 'Par défaut',
		defaultTitle: 'Arc par défaut',
		defaultHint: "Présélectionné au démarrage d'une nouvelle séance.",
		currentSetup: 'Configuration actuelle',
		arrowsShot: 'Flèches tirées',
		arrowsShotShort: 'Flèches',
		viewList: 'Voir tous les arcs',
		sessionsCount: 'Séances',
		activitiesCount: 'Tirs',
		lastUsed: 'Dernière utilisation le {date}',
		historyTab: 'Historique',
		noChanges: 'Aucune modification en attente.',
		groupEmpty: 'Rien de renseigné',
		remarks: 'Remarques',
		remarksHint:
			"Ce qui n'entre pas dans les champs ci-dessus : épaisseurs de cales, numéros de série, ce qu'il reste à essayer.",
		pendingChanges: '{n} modifications en attente',
		reason: 'Pourquoi cette modification ?',
		saveRevision: 'Enregistrer comme nouvelle révision',
		revision: 'Révision {n}',
		initialRevision: 'Première configuration enregistrée.',
		noRevisions: "Aucun réglage enregistré. Remplissez l'onglet Réglages puis enregistrez.",
		deleteBow: 'Supprimer cet arc'
	},
	sight: {
		title: 'Repères de viseur',
		empty: 'Aucun repère. Ajoutez les distances que vous tirez.',
		distance: 'Distance',
		addMark: 'Ajouter',
		height: 'Hauteur',
		interpolatedHeight: 'Hauteur estimée',
		interpolatedHint:
			'Estimée à partir de vos repères réglés. Tirez la distance, puis saisissez ce que vous trouvez.',
		windage: 'Dérive',
		clicker: 'Clicker',
		plunger: 'Berger'
	},
	feed: {
		subtitle: 'Ce que les archers que vous suivez ont choisi de partager.',
		hintTitle: 'Nouveaux tirs partagés',
		hintBody: 'Glissez vers la gauche, ou touchez ici, pour lire le fil.',
		hintNever: 'Ne plus le proposer',
		bestShared: 'Meilleur partagé'
	},
	home: {
		title: 'Appchery',
		greeting: 'Prêt à tirer',
		thisMonth: 'Ce mois-ci',
		upNext: 'À venir',
		thisYear: 'Cette année',
		weekGoalStat: 'Objectif semaine',
		statNone: 'Rien',
		pickStat: 'Afficher ici',
		replayRings: 'Frapper la cible',
		seeStats: 'Statistiques',
		weekSessions: '{n} séances',
		lastSession: 'Dernière séance',
		neverShot: 'Aucune séance pour le moment.',
		recent: 'Séances récentes',
		seeAll: 'Toutes les séances',
		moreActions: 'Autres créations',
		next: 'Prochaine',
		resume: 'Reprendre',
		thisWeek: 'Cette semaine',
		elsewhere: 'Applis',
		newBest: 'Nouveau record'
	},
	share: {
		title: 'Partager ce tir',
		action: 'Partager',
		save: 'Enregistrer',
		saved: 'Enregistré dans {where}.',
		saving: 'Préparation…',
		average: 'Par flèche',
		end: 'Volée',
		endTotal: 'T/V',
		running: 'Total',
		tagline: 'Tiré avec Appchery',
		options: 'Ce qui est affiché',
		unavailable: 'Non enregistré',
		optionDate: 'Date',
		optionSessionName: 'Nom de la séance',
		optionPlace: 'Lieu',
		optionBow: 'Arc utilisé',
		optionCategory: 'Type de séance',
		optionRecap: 'Flèches, dix, X, moyenne',
		optionSheet: 'La feuille de marque',
		optionWeather: 'Icône météo',
		optionTemperature: 'Température',
		optionWind: 'Vent',
		optionOpponentArrows: 'Les flèches adverses',
		optionDark: 'Carte sombre'
	},
	help: {
		title: 'Comment ça marche',
		sessionTerm: 'Une séance',
		sessionBody:
			"est **une sortie**. Vous vous êtes déplacé, vous avez tiré, vous êtes rentré. Elle porte la date, l'arc emporté et la météo du moment. Tout le reste de l'application s'y rattache : la séance est donc **la première chose que l'on crée**, avant même de savoir ce que l'on va tirer.",
		activityTerm: 'Une activité',
		activityBody:
			"est **une chose faite pendant une séance** : un tir compté, ou une procédure de réglage. Une séance peut en contenir plusieurs. Un tir enregistre **chaque flèche**, ce qui permet de corriger un score plus tard ; un réglage note ce que vous avez changé et écrit une nouvelle révision de l'arc. Les flèches tirées sans être comptées vont dans le **compteur d'entraînement** et comptent tout de même dans votre volume.",
		planTerm: 'Un programme',
		planBody:
			"est **une semaine que vous comptez répéter**. Il contient les sorties prévues, aux jours et aux heures voulus, avec un objectif de flèches facultatif. Un programme est un **modèle, pas un historique** : ses séances apparaissent dans la liste pour les sept jours à venir, et rien n'est enregistré tant que vous n'avez pas tiré. Une semaine sautée ne laisse aucune trace.",
		bowTerm: 'Un arc',
		bowBody:
			"est tout ce avec quoi vous tirez : le vôtre, celui du club, un arc nu monté pour un week end. Donnez lui un nom que vous reconnaîtrez sur le râtelier. Son **type** détermine les réglages demandés et les procédures proposées : on ne demandera jamais le tiller d'une poulies.",
		revisionTerm: 'Une révision',
		revisionBody:
			"est **l'état des réglages d'un arc à un instant donné**, conservé plutôt qu'écrasé. Modifiez un réglage et les anciennes valeurs restent lisibles : un score tiré le mois dernier reste rattaché à l'arc qui l'a tiré. Une activité de réglage écrit une révision dès que vous notez ce que vous avez changé.",
		defaultBowTerm: "L'arc par défaut",
		defaultBowBody:
			"est celui présélectionné sur une nouvelle séance, signalé sur cette page. Il est **conservé sur cet appareil** plutôt que synchronisé, car l'arc que vous prenez dépend de l'endroit où vous êtes.",
		rangeTerm: 'Les filtres',
		rangeBody:
			'en haut de la page déterminent ce que lisent tous les chiffres en dessous : une période, un tir, un arc, un type de session, un vent. Ils se combinent, pour demander comment vous tirez **dans le vent avec un arc donné**. Les périodes sont glissantes, pas calendaires : le 2 du mois, vous voyez toujours trente jours de travail.',
		chartTerm: 'Le graphique principal',
		chartBody:
			'compte toutes les flèches saisies, tir terminé ou non, et colore chaque barre selon le **type de session**. Une mesure à la fois : le volume, le score par flèche, ou le nombre de tirs. Touchez une barre pour lire ce jour, cette semaine ou ce mois seul.',
		roundTerm: 'Un type de tir',
		roundBody:
			"est déduit de ce que vous avez tiré, jamais de son nom : la **distance, le blason, les volées et les flèches qu'elles contiennent**. Les mêmes douze volées à 70m sont un seul type de tir, que vous ayez choisi le WA 720 dans la liste ou construit le tir vous-même.",
		bestTerm: 'Un record personnel',
		bestBody:
			"est le meilleur score d'**un même type de tir**, et seuls les tirs terminés comptent : un tir abandonné affiche un total plus bas pour une raison qui ne dit rien de votre tir. Les égalités se départagent aux dix, puis aux X, comme d'usage. Épinglez les tirs qui comptent pour les garder en haut.",
		consistencyTerm: 'La régularité',
		consistencyBody:
			"est la dispersion de vos derniers scores plutôt que leur moyenne. C'est le chiffre à suivre une fois la moyenne stabilisée : **on plafonne en moyenne bien avant de plafonner en régularité**, et une dispersion plus faible signale un geste plus reproductible."
	},
	plans: {
		title: 'Programmes',
		view: "Voir les programmes d'entraînement",
		slot: 'Prévue',
		newPlan: 'Nouveau programme',
		name: 'Nom du programme',
		empty: 'Aucun programme. Un programme est une semaine que vous comptez répéter.',
		activeTitle: 'Programme actif',
		activeHint:
			"Désactivé, ce programme ne remplit plus la liste des séances et ne compte plus dans l'objectif hebdomadaire.",
		paused: 'En pause',
		startDate: 'À partir du',
		endDate: 'Jusqu’au',
		datesHint: 'Entre ces deux jours, tous deux compris. En dehors, le programme ne demande rien.',
		anyDate: 'Non défini',
		clearDate: 'Effacer cette date',
		fromDate: 'Dès le {date}',
		untilDate: 'Jusqu’au {date}',
		betweenDates: 'Du {from} au {to}',
		weekTotal: 'Flèches par semaine',
		freeArrows: 'Flèches libres',
		freeArrowsHint: 'Dues sur la semaine, tirées dans la séance de votre choix.',
		addSlot: 'Ajouter une séance',
		slotTitle: 'Séance prévue',
		slotName: 'Nom',
		noSlots: 'Rien de prévu ce jour.',
		deletePlan: 'Supprimer ce programme',
		confirmTitle: 'Supprimer ce programme ?',
		confirmBody: 'Les séances déjà tirées sont conservées.',
		sessionsCount: '{n} séances par semaine'
	},
	stats: {
		title: 'Statistiques',
		byRoundOpen: 'Flèches par tir',
		filter: {
			period: 'Période',
			rounds: 'Tir',
			bows: 'Arc',
			kinds: 'Type',
			wind: 'Vent',
			reset: 'Effacer les filtres',
			clearOne: 'Effacer ce filtre',
			from: 'Du',
			to: 'au'
		},
		period: {
			all: 'Depuis le début',
			thisYear: 'Cette année',
			year: 'Douze derniers mois',
			month: 'Trente derniers jours',
			custom: 'Période choisie',
			/* Utilisés quand la ligne de filtres ne tient pas sur une seule ligne. */
			allShort: 'Tout',
			thisYearShort: 'Cette année',
			yearShort: '12 derniers mois',
			monthShort: '30 derniers j.',
			customShort: 'Choisie'
		},
		metric: {
			arrows: 'Flèches',
			perArrow: 'Par flèche',
			rounds: 'Tirs'
		},
		grain: {
			day: 'Par jour',
			week: 'Par semaine',
			month: 'Par mois'
		},
		slice: '{rounds} tirs · {arrows} flèches',
		barLabel: '{arrows} flèches en {rounds} tirs',
		barRange: 'du {from} au {to}',
		clearBar: 'Revenir à toute la période',
		scaleHint: 'plus c’est opaque, plus c’est récent',
		byKind: 'Score selon le type de séance',
		emptyRange: 'Rien de tiré sur cette période.',
		empty: 'Terminez un tir et vos scores apparaîtront ici.',
		overview: "Vue d'ensemble",
		totalArrows: 'Flèches tirées',
		byRound: 'Par tir',
		daysShot: 'Jours de tir',
		roundsShot: 'Tirs',
		completeRounds: '{n} terminés',
		perArrow: 'Par flèche',
		noVolume: 'Rien de tiré sur les douze derniers mois.',
		byRoundHint: 'Toutes les flèches comptent ici, tir terminé ou non.',
		perRoundTitle: 'Records personnels',
		perRoundHint: 'Seuls les tirs menés à leur terme sont comparés.',
		personalBest: 'Record personnel',
		personalBestShort: 'Rec. perso.',
		average: 'Moyenne',
		trend: 'Tendance par flèche',
		rounds: '{n} tirs',
		volumeKind: {
			match: 'Matchs',
			tuning: 'Réglages',
			freeScore: 'Score seul',
			drill: 'Exercices de tir',
			training: 'Flèches libres'
		},
		bestOn: 'Record le {date}',
		spread: 'Écart',
		distribution: 'Où les flèches sont arrivées',
		byEnd: 'Au fil du tir',
		byEndHint: "Moyenne par flèche à chaque volée, dans l'ordre où elles ont été tirées.",
		byEndCount: 'Sur {n} tirs.',
		byWind: 'Score selon le vent',
		byBow: "Score selon l'arc",
		byTemperature: 'Score selon la température',
		byPartOfDay: 'Score selon le moment de la journée',
		byWeekday: 'Score selon le jour de la semaine',
		byPlace: 'Score selon le lieu',
		distributionHint: 'Toutes les flèches du filtre actuel, par zone touchée.',
		temperature: {
			cold: 'Froid',
			cool: 'Frais',
			mild: 'Doux',
			hot: 'Chaud'
		},
		partOfDay: {
			morning: 'Matin',
			afternoon: 'Après-midi',
			evening: 'Soir',
			night: 'Nuit'
		},
		blocks: {
			title: 'Blocs de cette page',
			hint: 'Tout ce qui suit le graphique est optionnel. Activez ce que vous voulez regarder.',
			noData: 'Rien à afficher pour le moment',
			kind: 'Score selon le type de séance',
			bests: 'Records personnels',
			wind: 'Score selon le vent',
			byEnd: 'Au fil du tir',
			bow: "Score selon l'arc",
			temperature: 'Score selon la température',
			partOfDay: 'Score selon le moment de la journée',
			weekday: 'Score selon le jour de la semaine',
			place: 'Score selon le lieu',
			distribution: 'Où les flèches sont arrivées',
			volumeByRound: 'Flèches par tir'
		},
		perArrowHint: 'Score par flèche, pour comparer des tirs de longueurs différentes.',
		wind: {
			calm: 'Calme',
			light: 'Léger',
			moderate: 'Modéré',
			strong: 'Fort'
		},
		more: 'Plus',
		less: 'Moins',
		favourite: 'Épingler en haut',
		unfavourite: 'Retirer du haut'
	},
	auto: {
		title: 'Score auto',
		starting: 'Démarrage de la caméra.',
		recording: 'Enr',
		open: 'Score auto',
		hint: 'Les flèches détectées sont des propositions. Touchez-en une pour la retirer, puis gardez le reste.',
		noFace: 'Recherche du blason',
		settling: 'Recherche des flèches',
		angle: 'Placez-vous davantage face à la cible',
		watching: 'Recherche des flèches',
		keep: 'Garder {n}',
		drop: 'Retirer cette flèche',
		tapToDrop: 'Touchez une flèche pour la retirer.',
		tooMany: 'Il ne reste que {n} flèches dans cette volée. Les autres sont ignorées.',
		denied: "L'autorisation caméra est nécessaire pour marquer depuis la caméra.",
		experimental:
			'Le marquage par caméra est expérimental. Vérifiez toujours les valeurs avant de les garder.'
	},
	account: {
		title: 'Compte',
		hint: 'La synchronisation est facultative. Tout fonctionne sans compte, et fonctionnera toujours.',
		signedInAs: 'Connecté avec {email}',
		email: 'Adresse e-mail',
		password: 'Mot de passe',
		signIn: 'Se connecter',
		signUp: 'Créer un compte',
		signOut: 'Se déconnecter',
		haveAccount: "J'ai déjà un compte",
		needAccount: "J'ai besoin d'un compte",
		forgot: 'Mot de passe oublié',
		resetSent: 'Si cette adresse a un compte, un lien de réinitialisation arrive.',
		confirmEmail: 'Confirmez votre adresse par e-mail, puis connectez-vous.',
		adopted: 'Vos {n} enregistrements existants appartiennent maintenant à ce compte.',
		adoptedNone: 'Connecté.',
		unclaimed: "{n} enregistrements sur cet appareil n'appartiennent encore à aucun compte.",
		someRefused: 'Le serveur a refusé {n} changements.',
		silentSince: 'Rien n’a été synchronisé depuis {days} jours.',
		pressSync: 'Synchroniser les réessaie.',
		syncNow: 'Synchroniser maintenant',
		syncAutomatic:
			'La synchronisation est automatique. Ce bouton ne fait que la demander plus tôt.',
		syncing: 'Synchronisation…',
		lastSync: 'Dernière synchronisation {at}',
		neverSynced: 'Pas encore synchronisé.',
		waiting: '{n} changements en attente de connexion.',
		signOutKeeps: 'Se déconnecter ne change rien sur cet appareil : vos données locales sont conservées.',
		noServer: "Cette version n'a aucun serveur de synchronisation configuré.",
		wipeSignedIn: 'Déconnectez-vous avant d\'effacer cet appareil.',
		error: {
			credentials: 'Cette adresse et ce mot de passe ne correspondent à aucun compte.',
			offline: 'Pas de connexion. Réessayez quand vous aurez du réseau.',
			unknown: 'Une erreur est survenue. Réessayez.'
		}
	},
	ianseo: {
		title: 'Compétitions',
		subtitle: 'Résultats publiés sur ianseo',
		searchPlaceholder: 'Chercher dans toutes les compétitions',
		nearMe: 'Près de moi',
		nearMeHint: "Les compétitions sont situées par la ville où elles ont lieu, cherchée une fois puis conservée. Seul le nom de la ville est envoyé ailleurs : votre position reste sur cet appareil.",
		anyDistance: 'Toutes distances',
		entryForm: 'Inscription',
		entryMandat: 'Mandat',
		entryWho: 'Les inscrits',
		entryOpen: 'Inscriptions ouvertes',
		entryBy: "Les inscriptions passent par Inscript'Arc, qui s'ouvre dans votre navigateur.",
		entrySection: 'Inscriptions ouvertes',
		entrySectionHint: "Compétitions françaises prenant les inscriptions en ligne qui ne sont pas dans la liste ci dessus.",
		findInDocument: 'Chercher un archer',
		foundRows: '{n} lignes',
		foundMatches: '{n} matchs',
		noOneFound: 'Personne de ce nom ici',
		noOneFoundBody: 'Chaque mot doit apparaître quelque part dans la ligne. Essayez le nom seul, ou un club.',
		columns: 'Colonnes',
		columnsHint: "Un résultat s'ouvre avec les colonnes qui distinguent une ligne d'une autre. Ajoutez celles que vous voulez : elles sont retenues par intitulé, donc ajouter le club une fois l'ajoute à toutes les listes qui en portent un. Ouvrir une ligne montre tout, de toute façon.",
		findDocument: 'Chercher un document',
		foundDocuments: '{n} documents',
		noDocumentFound: 'Aucun document de ce nom',
		noDocumentFoundBody: 'Essayez une catégorie, un type d\'arc, ou le type de tir.',
		searchScope: 'Recherche',
		searchAll: 'Partout',
		searchMine: 'Ce que je suis',
		within: 'À moins de {km} km',
		nearYou: 'Compétitions à moins de {km} km de vous.',
		locating: 'Recherche de votre position',
		locatingTowns: 'Localisation de {n} villes',
		locationDenied: "Votre position a été refusée, la distance ne peut donc pas être calculée.",
		updateLocation: 'Mettre à jour ma position',
		away: 'à {km} km',
		following: 'Suivies',
		newResults: 'Nouveau',
		filters: 'Affichées',
		countries: 'Pays',
		addCountry: 'Ajouter un pays',
		chooseCountry: 'Choisir un pays',
		countrySearch: 'Pays',
		majorEvents: 'Championnats et jeux',
		majorHint: "Les compétitions que l'équipe ianseo gère elle-même, où qu'elles aient lieu.",
		running: 'En cours',
		upcoming: 'À venir',
		finished: 'Terminées',
		readAt: 'Lu {when}',
		justRead: "Lu à l'instant",
		readNever: 'Jamais lu',
		refresh: 'Actualiser',
		reading: 'Lecture de ianseo',
		stale: 'ianseo est injoignable. Ceci a été lu {when}.',
		emptyTitle: 'Rien à afficher pour le moment',
		emptyBody: 'Ajoutez le pays où vous tirez, ou cherchez une compétition par son nom.',
		noMatchTitle: 'Aucune compétition trouvée',
		noMatchBody: "ianseo n'a rien sous ces mots. Essayez la ville, ou l'organisateur.",
		errorTitle: 'ianseo est injoignable',
		errorBody: "Rien n'en a encore été lu sur cet appareil, il n'y a donc rien à montrer.",
		unreadableTitle: 'Cette page de ianseo a changé',
		unreadableBody: "ianseo a répondu, mais cette version de l'application n'a pas su lire ce qu'il a envoyé, ce qui veut souvent dire que la page a changé et que l'application doit être mise à jour. Le PDF sur ianseo, lui, contient toujours tout.",
		unreadableStale: "Lu {when}. Depuis, ianseo a changé cette page et cette version de l'application ne sait plus la lire.",
		partial: "Une partie de cette page n'a pas pu être lue : il peut y manquer des éléments.",
		retry: 'Réessayer',
		offerCountry: 'Suivre les compétitions en {country} ?',
		offerCountryBody: "Ce sont celles que vous verriez en premier. Tout le reste demeure accessible par la recherche.",
		offerYes: 'Oui, suivre {country}',
		offerNo: 'Pas maintenant',
		follow: 'Suivre',
		unfollow: 'Ne plus suivre',
		followCompetition: 'Suivre cette compétition',
		unfollowCompetition: 'Ne plus suivre cette compétition',
		documents: 'Documents',
		noDocumentsTitle: 'Rien de publié pour le moment',
		noDocumentsBody: "ianseo n'a ni résultats, ni listes d'inscrits, ni tableaux pour cette compétition.",
		updated: 'Mis à jour {when}',
		pdf: 'PDF',
		openOnIanseo: 'Ouvrir sur ianseo',
		peopleHere: 'Suivis ici',
		peopleHint: 'Leur ligne est marquée partout où elle apparaît dans cette compétition.',
		followName: 'Suivre {name}',
		unfollowName: 'Ne plus suivre {name}',
		details: 'Détails',
		sets: 'Volées',
		emptyDocumentTitle: 'Encore vide',
		emptyDocumentBody: "ianseo a publié ce document, mais il n'y a rien à y lire pour l'instant.",
		missingDocumentTitle: "Ce document n'existe plus",
		missingDocumentBody: 'ianseo ne le publie plus. La page de la compétition liste ce qui reste.',
		bracketEmpty: "Le tableau est établi, mais rien n'a encore été tiré.",
		byline: 'Lu depuis ianseo.net',
		competitionCount: '{count} compétitions',
		oneCompetition: '1 compétition'
	},
	friends: {
		title: 'Social',
		signedOutTitle: 'Connectez-vous pour suivre des archers',
		signedOutBody: 'Suivre quelqu’un, et partager vos tirs, demande un compte. Tout le reste de l’app n’en demandera jamais.',
		claimTitle: 'Choisissez un identifiant',
		claimHint: 'L’identifiant permet qu’on vous trouve. Rien avant cette étape ne vous rend trouvable, et vous pouvez en rester là.',
		handlePlaceholder: 'votrenom',
		handleRules: 'De trois à vingt caractères : lettres, chiffres et tirets bas.',
		handleTaken: 'Cet identifiant est déjà pris.',
		claim: 'Prendre cet identifiant',
		publicTitle: 'Profil public',
		publicHint: 'N’importe qui peut vous suivre et voir ce que vous partagez.',
		privateHint: 'Vous validez chaque abonné. Seuls les abonnés validés voient ce que vous partagez.',
		searchPlaceholder: '@identifiant',
		find: 'Chercher',
		noSuchHandle: 'Aucun archer avec cet identifiant.',
		noSuchHandleBody: 'Les identifiants sont exacts : vérifiez l’orthographe, ou faites-vous le dicter.',
		tooManyLookups: 'Trop de recherches d’un coup. Réessayez dans une minute.',
		actionFailed: 'Cela n’est pas passé. Rien n’a été modifié.',
		follow: 'Suivre',
		askToFollow: 'Demander à suivre',
		unfollow: 'Ne plus suivre',
		cancelRequest: 'Annuler la demande',
		remove: 'Retirer',
		approve: 'Accepter',
		refuse: 'Refuser',
		requests: 'Demandes reçues',
		followsYou: 'Vous suit',
		block: 'Bloquer',
		unblock: 'Débloquer',
		blockTitle: 'Bloquer cet archer ?',
		blockBody: 'Cet archer cesse de vous suivre, ne peut plus vous suivre, et votre profil lui apparaît comme privé. Rien ne l’en informe.',
		visibility: 'Qui peut vous suivre',
		publicProfile: 'Profil public',
		privateProfile: 'Profil privé',
		feedTab: 'Partagés',
		followingTab: 'Abonnements',
		followersTab: 'Abonnés',
		anActivity: 'Une activité',
		arrows: '{n} flèches',
		emptyFeedTitle: 'Rien de partagé avec vous',
		emptyFeedBody: 'Abonnez-vous à un archer, et ses partages apparaissent ici.',
		emptyFollowingTitle: 'Vous ne suivez personne',
		emptyFollowingBody: 'Cherchez un identifiant ci-dessus. Ils sont exacts, il vous faut l’orthographe.',
		emptyFollowersTitle: 'Personne ne vous suit encore',
		emptyFollowersBody: 'Donnez votre identifiant à quelqu’un : cela suffit pour vous trouver.',
		nothingSharedTitle: 'Rien de partagé',
		nothingSharedBody: 'Cet archer n’a encore rien partagé.',
		nothingVisibleBody: 'Vous verrez ses partages une fois votre demande acceptée.',
		status: {
			pending: 'Demandé',
			approved: 'Suivi'
		},
		cardArrows: 'Flèches',
		cardSessions: 'Sorties',
		cardBadges: 'Badges',
		cardLevel: 'Niveau',
		cardStale: 'À leur dernière synchronisation.',
		share: 'Partager cette activité',
		shareHint: 'Les activités partagées sont visibles selon votre profil. Le lieu, la météo et l’arc ne voyagent jamais avec.',
		shared: 'Partagée',
		unshare: 'Ne plus partager'
	},
	backup: {
		title: 'Sauvegarde',
		hint: 'Vos données sont sur cet appareil, et sur le serveur de synchronisation dès que vous êtes connecté. Une sauvegarde est un fichier à vous, qu’aucun des deux ne peut perdre.',
		export: 'Exporter',
		import: 'Importer',
		exported: '{n} lignes exportées.',
		imported: '{n} lignes restaurées.',
		confirmTitle: 'Tout remplacer ?',
		confirmBody:
			"Restaurer {name} supprime d'abord toutes les séances, activités et arcs de cet appareil.",
		confirmAction: 'Restaurer',
		error: {
			notJson: "Ce fichier n'est pas un JSON lisible.",
			notABackup: "Ce fichier n'est pas une sauvegarde Appchery.",
			tooNew: "Cette sauvegarde vient d'une version plus récente. Mettez Appchery à jour."
		}
	},
	freeScore: {
		title: 'Score seul',
		group: 'Compté sans les flèches',
		hint: 'Des flèches comptées et un total, sans le détail flèche par flèche.',
		setupHint: 'Où cela a été tiré. Les flèches et le score se saisissent au fil du tir.',
		create: 'Commencer',
		arrows: 'Flèches tirées',
		total: 'Score total',
		average: '{value} par flèche'
	},
	danger: {
		title: 'Zone dangereuse',
		imported: 'Supprimer les séances importées',
		importedHint: "Supprime toutes les séances écrites par un import, et rien de ce que vous avez saisi ici.",
		importedRemoved: '{n} séances importées supprimées.',
		everything: 'Supprimer toutes les données',
		everythingHint: 'Supprime toutes les séances, activités, arcs, plans et badges de cet appareil.',
		everythingRemoved: 'Tout a été supprimé.',
		rebuild: 'Refaire la base de données',
		rebuildHint: "Vide entièrement la base et la reconstruit telle que cette version de l'application l'attend. La seule issue pour une base que l'application ne sait pas lire.",
		rebuilt: 'La base de données a été refaite.',
		confirmTitle: {
			imported: 'Supprimer les séances importées ?',
			everything: 'Tout supprimer ?',
			rebuild: 'Refaire la base de données ?'
		},
		confirmBody: {
			imported: "Toutes les séances écrites par un import disparaissent, avec leurs comptages et leurs flèches. Les séances saisies dans Appchery sont conservées.",
			everything: "Toutes les séances, activités, arcs, plans et badges de cet appareil disparaissent. Exportez une sauvegarde d'abord si vous voulez en récupérer quelque chose.",
			rebuild: "Tout ce qui est sur cet appareil disparaît, et la base est reconstruite à partir de rien. Une sauvegarde exportée maintenant emporterait le même problème : mettez de côté ce dont vous avez besoin autrement."
		},
		confirmAction: {
			imported: 'Supprimer les imports',
			everything: 'Tout supprimer',
			rebuild: 'La refaire'
		}
	},
	importer: {
		warnings: 'À savoir',
		warning: {
			unreadableRow: '{n} lignes illisibles ont été ignorées.',
			undatedRow: '{n} lignes sans date exploitable ont été ignorées.',
			orphanRow: "{n} comptages désignaient une séance absente du fichier : une séance leur a été créée.",
			droppedCoordinates: "{n} comptages avaient des positions de flèches incohérentes avec leurs scores : les positions ont été abandonnées, les scores conservés.",
			unknownSheet: 'La feuille « {detail} » n\'a pas été reconnue et a été laissée de côté.',
			noSessionSheet: "Le fichier ne contient pas de feuille de séances : chaque comptage a reçu une séance."
		},
		nothingHanded: "Aucun fichier n'a été transmis. Ouvrez un export depuis vos fichiers, ou choisissez-en un dans les paramètres.",
		openSettings: 'Aller aux paramètres',
		reading: 'Lecture du fichier…',
		doneTitle: 'Import terminé',
		failedTitle: "Échec de l'import",
		title: 'Importer depuis une autre application',
		hint: "Chargez un export CapTarget (.xlsx). Les séances déjà importées sont mises à jour ; le reste de l'appareil n'est pas touché.",
		choose: 'Choisir un export',
		confirmTitle: 'Importer ce fichier ?',
		confirmAction: 'Importer',
		bow: 'Arc utilisé pour ces séances',
		noBow: "Ne pas renseigner d'arc",
		working: 'Import en cours…',
		progress: '{done} séances sur {total} écrites.',
		workingHint: 'Écriture des séances et recomptage des badges.',
		confirmBody: '{name} contient {sessions} séances, {rounds} comptages et {arrows} flèches.',
		skipped: '{n} lignes illisibles seront ignorées.',
		imported: '{sessions} séances et {arrows} flèches importées.',
		error: {
			tooLarge: 'Ce fichier est trop volumineux pour être lu sur un téléphone.',
			notAWorkbook: "Ce fichier n'est pas un export .xlsx.",
			unreadableWorkbook: "Ce fichier n'a pas pu être ouvert. Réexportez-le depuis l'autre application.",
			nothingFound: "Rien d'exploitable n'a été trouvé dans ce fichier."
		}
	},
	storage: {
		volatileWarning: "Les scores seront perdus au rechargement. Installez l'application.",
		volatileDismiss: 'Ignorer'
	},
	settings: {
		title: 'Paramètres',
		appTab: 'Application',
		shootingTab: 'Tir',
		dataTab: 'Données',
		linkEquipment: 'Liste du matériel',
		language: 'Langue',
		theme: 'Thème',
		themeLight: 'Clair',
		themeDark: 'Sombre',
		themeSystem: 'Système',
		conditions: 'Lieu et météo',
		locationTitle: 'Enregistrer le lieu',
		locationHint:
			"Le démarrage d'une séance enregistre le lieu de tir. L'autorisation de localisation est demandée à l'activation.",
		weatherTitle: 'Enregistrer la météo',
		weatherHint:
			'Récupère la météo de ce lieu une seule fois, au début de la séance. Nécessite une connexion réseau.',
		plotting: 'Pointage des flèches',
		tapWindowTitle: 'Toucher ou viser',
		tapWindowHint:
			"Un appui plus court dépose la flèche à l'endroit touché. Plus long, la loupe s'ouvre pour viser avant de relâcher.",
		tapWindowShort: 'Vise plus vite',
		tapWindowLong: 'Touche plus vite',
		driftTitle: 'Signaler une flèche qui sort du lot',
		driftHint:
			"Prévient quand une flèche numérotée tombe régulièrement à l'écart des autres. Demande des flèches pointées sur le blason et numérotées, et se tait tant que le constat n'est pas net.",
		hapticsTitle: 'Vibrer au toucher',
		hapticsHint:
			"Une brève vibration quand un appui compte une flèche ou vise, comme une touche de clavier.",
		milliseconds: '{n} ms',
		display: 'Affichage',
		recordTitle: 'Enregistrer la vidéo du marquage',
		recordHint:
			"Enregistre sur cet appareil une vidéo de chaque marquage à la caméra, pour améliorer la détection. Rien n'est envoyé.",
		motionTitle: 'Enregistrer aussi les mouvements du téléphone',
		motionHint:
			"Enregistre l'inclinaison et la rotation du téléphone à côté de la vidéo, pour améliorer la détection plus tard. À désactiver si la page caméra se comporte mal sur cet appareil.",
		motionNone:
			"Cet appareil n'a signalé aucun mouvement pendant l'enregistrement, aucun fichier n'a donc été créé. Les téléphones le signalent, la plupart des ordinateurs non.",
		recordPath:
			"Les vidéos sont enregistrées sur cet appareil, une par volée, nommées d'après l'activité et la volée correspondantes. Récupérez-les par câble ou avec le gestionnaire de fichiers.",
		detectorTitle: 'Détecteur de flèches',
		detectorHint:
			'Méthode de lecture des flèches. Classique par règles de forme et de couleur, apprise par un petit modèle entraîné. Les deux fonctionnent sur cet appareil.',
		detectorClassical: 'Classique',
		detectorLearned: 'Apprise',
		smoothTitle: "Stabiliser l'incrustation",
		smoothHint:
			"Lisse les lignes tracées sur le blason pour qu'elles cessent de trembler. Seul l'affichage change : les flèches sont lues de la même façon.",
		feedHintTitle: 'Proposer le fil sur la page d’accueil',
		feedHintHint:
			'Quand un archer que vous suivez partage un tir que vous n’avez pas lu, l’accueil le signale. Le fil reste à un glissement vers la gauche de l’accueil dans tous les cas.',
		newButtonTitle: 'Bouton de séance complet',
		newButtonHint:
			'Termine la liste des séances par le bouton large et son menu. Désactivé, un bouton rond se place dans le coin et ouvre les mêmes choix.',
		refreshTitle: "Actualiser l'application",
		refreshHint: 'Recharge la dernière version. Vos données ne sont pas touchées.',
		refreshOffline: 'Pas de réseau : connectez-vous et réessayez.',
		refreshAction: 'Actualiser',
		installTitle: 'Installer Appchery',
		installHint:
			"L'ajoute à votre écran d'accueil et la lance sans les barres du navigateur. Vos scores restent où ils sont.",
		installAction: 'Installer',
		fullscreenTitle: 'Plein écran',
		fullscreenHint:
			"Masque les barres du navigateur jusqu'à ce que vous quittiez la page ou la rechargiez. Installer l'application le fait définitivement.",
		noAnimationsTitle: 'Désactiver les animations',
		noAnimationsHint:
			"Arrête l'onde à l'ouverture de l'application, l'anneau de la liste des séances et le feu d'artifice sur un record. Les indicateurs de progression continuent de tourner.",
		competitionColourTitle: 'Couleur des compétitions',
		competitionColourHint:
			'La couleur des compétitions dans la liste des séances et sur la page statistiques.',
		colour: {
			default: 'Par défaut',
			blue: 'Bleu',
			ink: 'Encre',
			red: 'Rouge sombre'
		},
		clockTitle: 'Format 24 heures',
		clockHint: 'Afficher 14:30 plutôt que 2:30 PM.',
		placeTitle: 'Nommer le lieu',
		placeHint:
			'Recherche la ville la plus proche. Vos coordonnées sont envoyées à un tiers, ce que leur enregistrement local ne fait pas.',
		schema: 'schéma {version}',
		schemaAhead: "Cette base a été écrite par une version de l'application plus récente que celle ci. Rien ici ne peut la faire avancer : ce qui lui manque continuera d'échouer tant qu'elle n'aura pas été refaite.",
		storage: 'Stockage',
		persistent: 'Persistant',
		volatile: 'En mémoire, perdu au rechargement',
		storageWhy: {
			insecure: "Cette adresse n'est pas un contexte sécurisé : le navigateur n'y conservera pas de base. Ouvrez l'app en HTTPS, ou sur localhost.",
			notIsolated: "La page n'est pas isolée : le serveur n'envoie pas les deux en-têtes d'isolation.",
			blocked: "Le navigateur refuse de stocker des données pour ce site. Vérifiez que les données du site ne sont pas bloquées ou effacées à la fermeture pour cette adresse, puis rechargez.",
			noOpfs: "Ce navigateur n'a pas de système de fichiers privé où stocker une base.",
			unknown: "Une autre fenêtre d'Appchery a probablement la base ouverte, ou le navigateur efface encore ce site. Fermez les autres fenêtres et rechargez."
		},
		linkBadges: 'Badges',
		linkShare: 'Partager',
		linkTricks: 'Astuces',
		about: 'À propos',
		version: 'Version {version}',
		build: 'build {n}',
		licence: 'Sous licence {name}',
		linkMuscles: 'Anatomie',
		forgetTitle: 'Fêter à nouveau',
		forgetHint:
			"Un niveau ou un record n'est annoncé qu'une fois. Oubliez lesquels l'ont été, et le prochain atteint ramène le feu d'artifice.",
		forgetAction: 'Oublier ce qui a été fêté',
		forgetResult: 'Oublié. Le prochain tir, match ou compte de flèches ramène le feu d’artifice.',
		recalcTitle: 'Revérifier les badges',
		recalcHint:
			'Un badge acquis est conservé. La vérification le confronte aux tirs encore enregistrés : tout badge dont les tirs ont disparu est retiré.',
		recalcAction: 'Vérifier',
		recalcResult: '{awarded} obtenus, {revoked} retirés.'
	},
	muscles: {
		title: 'Anatomie',
		intro:
			"Ce que le tir demande au corps, muscle par muscle et moment par moment. Choisissez les muscles qu'un exercice travaille.",
		bones: 'Os',
		bonesHint:
			"Regardez les omoplates. Elles glissent vers la colonne à mesure que l'armement recule, et c'est ce glissement qui fait le tir : aucun muscle dessiné sur une silhouette figée ne peut le montrer.",
		plateTitle: "Le dos, d'après nature",
		plateAlt: "Une planche anatomique des muscles du dos, trapèze intact d'un côté et écarté de l'autre.",
		plateCaption:
			"Le trapèze est entier à gauche et retiré à droite, découvrant les rhomboïdes, l'élévateur de l'omoplate et la coiffe. Extrait du Gray's Anatomy, 1918, depuis longtemps dans le domaine public.",
		phaseTitle: 'Le tir',
		play: 'Dérouler le tir',
		pause: 'Pause',
		pickAPhase: "Choisissez un moment du tir pour voir ce qu'il demande.",
		working: 'Au travail',
		nothingWorking: "Presque rien : c'est le moment d'avant.",
		selection: 'Sélection',
		selectionEmpty: 'Touchez un muscle sur la silhouette, ou dans la liste ci-dessous.',
		clear: 'Effacer',
		coverage: 'Couvre {percent} % de ce que le tir demande',
		peak: 'Travaille le plus à {phase}',
		deepTitle: 'Sous la surface',
insetHint:
			"Les deux omoplates, trapèze et deltoïde écartés. Choisir un muscle le choisit des deux côtés, comme sur le corps.",
		load: { 1: 'Léger', 2: 'Au travail', 3: 'À fond' },
		view: { back: 'Dos', front: 'Face', both: 'Les deux', deep: 'Profond' },
		inset: {
			scapulaBack: 'Les omoplates, vues de dos',
			scapulaFront: "Leur face avant, contre les côtes",
		},
		role: {
			mover: 'Fait le mouvement',
			stabiliser: "Tient l'articulation",
			postural: "Tient l'archer debout",
			fault: 'Doit rester tranquille'
		},
		roleShort: {
			mover: 'Moteur',
			stabiliser: 'Stabilisateur',
			postural: 'Postural',
			fault: 'Défaut'
		},
		side: { draw: 'Bras de corde', bow: "Bras d'arc", left: "La gauche de l'archer", right: "La droite de l'archer", },
		phase: {
			none: 'Aucun',
			stance: 'Position',
			set: 'Mise en place',
			setup: 'Levée',
			draw: 'Armement',
			anchor: 'Ancrage',
			transfer: 'Transfert',
			expansion: 'Expansion',
			release: 'Décoche',
			followThrough: 'Accompagnement'
		},
		name: {
			rhomboids: 'Rhomboïdes',
			trapeziusUpper: 'Trapèze supérieur',
			trapeziusMid: 'Trapèze moyen',
			trapeziusLower: 'Trapèze inférieur',
			levatorScapulae: "Élévateur de l'omoplate",
			latissimus: 'Grand dorsal',
			teresMajor: 'Grand rond',
			serratusAnterior: 'Dentelé antérieur',
			erectorSpinae: 'Érecteurs du rachis',
			deltoidPosterior: 'Deltoïde postérieur',
			deltoidLateral: 'Deltoïde moyen',
			deltoidAnterior: 'Deltoïde antérieur',
			supraspinatus: 'Sus-épineux',
			infraspinatus: 'Sous-épineux',
			teresMinor: 'Petit rond',
			subscapularis: 'Sous-scapulaire',
			pectoralisMajor: 'Grand pectoral',
			biceps: 'Biceps',
			triceps: 'Triceps',
			forearmFlexors: "Fléchisseurs de l'avant-bras",
			forearmExtensors: "Extenseurs de l'avant-bras",
			fingerFlexors: 'Fléchisseurs des doigts',
			rectusAbdominis: 'Grand droit',
			obliques: 'Obliques',
			transverseAbdominis: 'Transverse',
			gluteusMaximus: 'Grand fessier',
			gluteusMedius: 'Moyen fessier',
			tensorFasciaeLatae: 'Tenseur du fascia lata',
			iliopsoas: 'Psoas-iliaque',
			quadriceps: 'Quadriceps',
			hamstrings: 'Ischio-jambiers',
			calves: 'Mollets'
		}
	},
	training: {
		group: 'Entraînement'
	},
	strength: {
		title: 'Renforcement',
		hint: 'Élastique, maintiens et gainage, série après série.',
		progress: 'Fait pour le moment',
		sets: 'séries',
		finished: 'Terminé',
		resting: 'Repos {time}',
		upNext: 'Ensuite : {exercise}, série {set} sur {of}',
		addExercise: 'Ajouter un exercice',
		openExercise: 'Lire tout l\'exercice',
		worked: 'Ce que cette séance a travaillé',
		setNumber: 'Série {n}',
		secondsShort: 's',
		rowSummary: '{done} séries sur {total}',
		runningElsewhere: "La course est une activité à part, lancée depuis la même liste que celle ci."
	},
	running: {
		title: 'Course à pied',
		hint: 'Une sortie, notée : la distance, le temps, et la sensation.',
		what: 'La sortie',
		distance: 'Distance',
		km: 'km',
		kmValue: '{km} km',
		duration: 'Temps',
		minutesShort: 'min',
		secondsShort: 's',
		outOfRange: "C'est plus loin ou plus long qu'une sortie que l'application peut retenir.",
		pace: 'Allure',
		perKm: 'au km',
		paceWaiting: "Entrez une distance et un temps, l'allure se calcule toute seule.",
		effort: 'La sensation',
		effortHint: "La seule mesure d'effort dont on dispose toujours, et celle qui dit si demain est un jour de repos.",
		efforts: { easy: 'Facile', steady: 'Souple', tempo: 'Tempo', hard: 'Dur', max: 'À fond' },
		whatItWorks: 'Ce que ça travaille',
		unfinished: "Enregistré tel quel. Une sortie à moitié notée reste une sortie que vous avez faite."
	},
	// Le tir à une règle plutôt qu'à un tir compté, voir src/lib/domain/drills/types.ts.
	drill: {
		group: 'Exercices de tir',
		setupHint: 'Où cela se tire.',
		create: 'Commencer',
		callFrom: 'Anneaux annoncés',
		callFromHint: 'À partir de cet anneau vers le centre.',
		threshold: 'Zone de réussite',
		thresholdHint: 'Cet anneau ou plus au centre compte.',
		arrows: 'Flèches',
		arrowsOpen: 'Sans limite',
		arrowsOpenHint: "Continue jusqu'à ce que vous arrêtiez.",
		arrowsPerEnd: 'Flèches par volée',
		lives: 'Vies',
		livesHint: 'Flèches hors zone autorisées avant la fin.',
		ladder: 'Anneaux à franchir',
		ladderHint: "Une flèche ratée fait recommencer l'anneau en cours.",
		stepArrows: 'Flèches pour franchir un anneau',
		goal: 'Score à atteindre',
		seconds: 'Secondes',
		secondsHint: 'Le chrono démarre quand vous le dites.',
		waitHint: 'La pause entre les flèches.',
		arrowSet: 'Flèches du jeu',
		arrowSetHint: 'Tirez-les dans le même ordre à chaque volée.',
		rate: 'Taux de réussite',
		livesLeft: 'Vies restantes',
		bestStreak: 'Meilleure série',
		onNow: 'En cours : {n}',
		stepRing: 'Anneau à toucher',
		called: 'Annoncé : {ring}',
		clock: 'Temps restant',
		arrowsUsed: '{n} flèches',
		remaining: 'Encore {n} flèches',
		score: 'Score',
		startClock: 'Lancer le chrono',
		stop: "Arrêter l'exercice",
		stopConfirm: 'Arrêter cet exercice ?',
		stopBody: "Il garde les flèches déjà entrées et n'en prend plus.",
		reopen: 'Le reprendre',
		finished: 'Terminé',
		over: 'Cet exercice est terminé.',
		enterArrows: 'Entrer des flèches',
		waiting: 'Attendez {n} s',
		ready: 'Tirez quand vous êtes prêt',
		blindArrows: 'Flèches tirées',
		addArrows: 'Ajouter {n}',
		removeArrow: 'Une de moins',
		rating: 'Le ressenti',
		ratings: { 1: 'Affreux', 2: 'Laborieux', 3: 'Correct', 4: 'Bon', 5: 'Le meilleur' },
		meanRating: 'Ressenti : {rating}',
		ranking: "Vos flèches, les plus à part d'abord",
		rankingHint: 'Chaque tube face au reste du jeu, et non face au centre de la cible.',
		rankingEmpty: 'Pointez les flèches sur le blason pour voir ceci.',
		rankingThin: 'Tirez trois volées et le tube à part se montrera.',
		arrowNo: 'Flèche',
		offGroup: 'Écart au groupe',
		ownGroup: 'Groupement propre',
		average: 'Moyenne',
		noReading: '–',
		game: {
			successZone: { name: 'Zone de réussite', hint: 'Choisissez un anneau. Chaque flèche le touche ou le manque.' },
			lives: { name: 'Vies', hint: "Tirez jusqu'à avoir manqué la zone une fois de trop." },
			streak: { name: 'Série', hint: 'Quelle série de bonnes flèches vous arrivez à tenir.' },
			shrinkingZone: { name: 'Zone dégressive', hint: 'Un anneau franchi ouvre le suivant vers le centre.' },
			calledShot: { name: 'Anneau annoncé', hint: 'Un anneau est annoncé avant chaque flèche. Seul celui-là compte.' },
			targetScore: { name: 'Objectif de score', hint: 'Atteignez le score en le moins de flèches possible.' },
			beatTheClock: { name: 'Contre la montre', hint: 'Marquez le plus possible avant la fin du temps.' },
			arrowSorting: { name: 'Tri de flèches', hint: "Pointez chaque flèche dans l'ordre et voyez quel tube part à part." },
			blindBale: { name: 'Tir à blanc', hint: 'Yeux fermés, sans blason. Aucun score, juste le ressenti.' },
			onePressure: { name: 'Flèche unique', hint: 'Une flèche, une attente, puis une autre.' }
		}
	},
	exercises: {
		title: 'Exercices',
		intro:
			'Le renforcement du tir, chacun accompagné des muscles qu\'il travaille et du mouvement à faire.',
		all: 'Tout',
		empty: 'Rien avec ce matériel.',
		howTitle: 'Comment faire',
		worksTitle: 'Ce qu\'il travaille',
		movementTitle: 'Le mouvement',
		forTitle: 'À quoi il sert',
		startTitle: 'Par où commencer',
		startLead:
			'Un point de départ, pas une prescription. Progressez à partir de ce que vous tenez proprement.',
		sets: 'Séries',
		reps: 'Répétitions',
		hold: 'Maintien',
		rest: 'Repos',
		distance: 'Distance',
		seconds: '{n} s',
		metres: '{n} m',
		kilometres: '{n} km',
		play: 'Lancer',
		pause: 'Pause',
		cautionTitle: 'À lire avant',
		mainly: 'Surtout',
		also: 'Aussi',
		none: 'Sans matériel',
		kit: {
			none: 'Rien du tout',
			band: 'Élastique',
			bow: 'Arc',
			outdoors: 'Dehors'
		},
		measure: { reps: 'Répétitions', hold: 'Maintenu', distance: 'Distance' },
		level: {
			beginner: 'Tout archer',
			intermediate: 'Un peu entraîné',
			advanced: 'Entraîné'
		},
		activity: { strength: 'Renforcement', running: 'Course' },
		item: {
			bandPullApart: {
				name: 'Ouverture à l\'élastique',
				summary: 'L\'armement sans l\'arc. Tout ce qui tire la corde vers l\'arrière, travaillé d\'un coup.',
				step1: 'Debout, tenez un élastique léger devant vous à hauteur de poitrine, bras tendus et mains écartées de la largeur des épaules.',
				step2: 'Écartez les mains sur les côtés, bras tendus, jusqu\'à ce que l\'élastique touche la poitrine.',
				step3: 'Terminez en rapprochant les omoplates. Les mains montrent le mouvement : le travail est entre les omoplates.',
				step4: 'Revenez en contrôlant, en mettant deux fois plus de temps au retour qu\'à l\'ouverture.'
			},
			facePull: {
				name: 'Tirage au visage',
				summary: 'Le coude d\'armement, à qui l\'on apprend le chemin de l\'ancrage : haut, en arrière, derrière la tête.',
				step1: 'Fixez un élastique au dessus de la tête et prenez une extrémité dans chaque main, bras tendus vers lui.',
				step2: 'Tirez vers votre nez en menant par les coudes, qui partent largement sur les côtés et passent derrière les oreilles.',
				step3: 'Marquez un temps, omoplates basses et serrées, puis revenez en contrôlant.',
				step4: 'Gardez les épaules basses. Une épaule qui monte confie le travail au muscle que le tir veut silencieux.'
			},
			proneYtw: {
				name: 'Y, T et W au sol',
				summary: 'À plat ventre, sans rien pour aider. Les trois formes couvrent tout l\'arrière de l\'épaule.',
				step1: 'Allongez vous sur le ventre, front posé au sol, bras tendus devant vous.',
				step2: 'Y : bras tendus en V étroit, pouces vers le haut. Décollez les deux mains, tenez deux secondes, reposez.',
				step3: 'T : bras tendus sur les côtés. Décollez, tenez, reposez.',
				step4: 'W : coudes pliés et rangés contre les côtes. Décollez, serrez les omoplates, reposez.',
				step5: 'Le dos soulève, pas la nuque. Le front reste où il était.'
			},
			externalRotation: {
				name: 'Rotation externe',
				summary: 'La coiffe, à l\'arrière de l\'épaule, qui tient l\'articulation pendant que tout le reste tire.',
				step1: 'Debout, élastique léger devant vous, coudes pliés à angle droit et collés aux côtes.',
				step2: 'Coudes toujours au corps, faites pivoter les avant bras vers l\'extérieur jusqu\'à tendre l\'élastique devant vous.',
				step3: 'Revenez lentement. Les avant bras bougent, rien d\'autre.',
				step4: 'Glissez une serviette roulée sous chaque coude s\'ils partent en avant : c\'est le coude immobile qui fait travailler la coiffe plutôt que le dos.',
				caution: 'La coiffe est petite et s\'adapte lentement. Prenez l\'élastique le plus léger qui rende la dernière répétition difficile, et ajoutez des répétitions avant d\'ajouter de la tension.'
			},
			scapularSetting: {
				name: 'Placement des omoplates',
				summary: 'Trouver les muscles qui tiennent le tir, seuls, avant de leur mettre la moindre charge.',
				step1: 'Debout, bras le long du corps et épaules relâchées.',
				step2: 'Faites glisser les deux omoplates vers le bas et vers la colonne, sans monter les épaules ni bouger les bras.',
				step3: 'Tenez en respirant normalement, puis relâchez lentement.',
				step4: 'C\'est la position dans laquelle le transfert vous met. La trouver ici est ce qui permet de la trouver à pleine allonge.'
			},
			holdingSpt: {
				name: 'SPT de maintien',
				summary:
					"Pleine allonge, tenue. SPT veut dire entraînement physique spécifique : un travail qui entraîne le tir en faisant le tir, et celui ci est celui qui rend la dernière volée semblable à la première.",
				step1: "Encochez une flèche et placez vous face à une cible, pour qu'une corde qui échappe à des doigts fatigués ne coûte qu'un tir. Sans cible où tirer, faites le sans rien sur la corde.",
				step2: "Déroulez votre séquence de tir à l'arc ou à l'élastique jusqu'à la position de maintien.",
				step3: 'Tenez en alignement complet, sans viser quoi que ce soit de précis, en respirant normalement.',
				step4: 'Redescendez en contrôlant plutôt que de décocher, puis reposez et recommencez. À mesure que le maintien devient facile, allongez le et allongez le repos avec lui.',
				step5: "Arrêtez la série dès que l'alignement part. Un maintien épaule effondrée entraîne l'effondrement.",
				caution: "Un arc lâché à vide se détruit, et souvent avec la main qui le tient. Le plus sûr est donc de tenir avec une flèche encochée et une cible devant soi : si la corde part, la flèche part là où une flèche doit partir. Sans cible où tirer, tenez corde nue et redescendez délibérément à chaque fois. Dans tous les cas, à faire après le tir plutôt qu'avant."
			},
			reversals: {
				name: 'Reversals',
				summary: 'Armer, tenir, redescendre, recommencer. L\'armement lui même, répété bien plus qu\'une séance ne le demande.',
				step1: "Encochez une flèche et placez vous face à une cible, pour qu'un lâcher accidentel en fin de série coûte une flèche et rien d'autre. Sans cible où tirer, armez sans rien sur la corde.",
				step2: "Armez l'arc par votre séquence habituelle jusqu'à l'ancrage et au transfert.",
				step3: 'Tenez deux secondes en alignement complet.',
				step4: "Redescendez en contrôlant jusqu'à la position de placement, sans laisser tomber le bras d'arc.",
				step5: 'Enchaînez la série, puis reposez vraiment avant la suivante. Chaque répétition est une répétition de votre tir : arrêtez la série plutôt que de la finir mal.',
				caution: "Un arc armé et décoché sans rien sur la corde se détruit, et détruit la main qui le tient. Une flèche encochée devant une cible est la façon la plus sûre de faire ces séries, parce que des doigts fatigués lâchent : corde nue, rien ne rattrape cette erreur, et chaque descente doit être délibérée."
			},
			bowRaise: {
				name: 'Montée d\'arc',
				summary: 'Tenir l\'arc en l\'air, rien d\'autre. Ce qui fatigue en premier sur un long tir, travaillé à part.',
				step1: "Encochez une flèche et placez vous face à une cible si vous le pouvez, puis montez l'arc en position de placement, à peu près à hauteur de vos épaules.",
				step2: 'Tenez le bras d\'arc tendu et l\'épaule basse, en respirant normalement.',
				step3: 'Redescendez en contrôlant et reposez une minute ou deux.',
				step4: 'Arrêtez quand l\'épaule commence à monter vers l\'oreille. C\'est la fin de la série, quoi que dise le chronomètre.'
			},
			plank: {
				name: 'Gainage',
				summary: 'Le milieu du corps, contre lequel les deux extrémités du tir tirent.',
				step1: 'À plat ventre, montez sur les avant bras et la pointe des pieds, coudes sous les épaules.',
				step2: 'Tenez une ligne droite des talons au sommet du crâne, bassin ni creusé ni relevé.',
				step3: 'Tenez en respirant normalement plutôt qu\'en bloquant la respiration.',
				step4: 'Terminez la série quand la ligne casse. Du temps tenu de travers est du temps passé à apprendre le travers.'
			},
			running: {
				name: 'Course à pied',
				summary: 'La base sous tout le reste. Un concours, c\'est quatre heures debout, et cela se prépare.',
				step1: 'Courez à une allure où vous pourriez tenir une conversation. C\'est de l\'endurance, pas un chrono.',
				step2: 'Augmentez la distance d\'un dixième par semaine au plus, et gardez un jour entre une sortie et un gros volume de flèches.',
				step3: 'Son intérêt en tir à l\'arc est la récupération entre les volées et un cœur qui redescend à la demande, pas les jambes.'
			}
		},
		frame: {
			start: 'Départ',
			open: 'Ouverture',
			hold: 'Maintien',
			top: 'Haut',
			bottom: 'Bas',
			up: 'Montée',
			down: 'Descente',
			draw: 'Pleine allonge',
			letdown: 'Retour',
			stride: 'Foulée',
			end: 'Fin'
		}
	},
	experience: {
		title: 'Expérience',
		hint: 'Chaque flèche, chaque volée comptée, chaque badge, chaque match gagné.',
		levelStat: 'Niveau',
		level: 'Niveau {level}',
		levelUp: 'Niveau supérieur',
		levelShort: 'Niv {level}',
		points: '{xp} XP',
		intoLevel: '{into} XP sur {span}',
		toNext: '{xp} XP avant le niveau {level}',
		total: 'Expérience acquise',
		sources: "D'où elle vient",
		empty: "Rien de tiré, donc rien d'acquis.",
		share: '{percent} %',
		sourceNames: {
			arrows: 'Flèches',
			rounds: 'Séries',
			badges: 'Badges',
			matches: 'Matchs'
		},
		sourceCounts: {
			arrows: '{n} flèches tirées',
			rounds: '{n} séries terminées',
			badges: '{n} badges obtenus',
			matches: '{n} matchs gagnés ou nuls'
		},
		rates: 'Ce que valent les choses',
		rules: {
			arrows: {
				title: 'Flèches',
				formula: 'flèches tirées × {xp} XP',
				body: "Chaque flèche qui compte dans votre volume rapporte autant, quel que soit le motif du tir: un échauffement, une procédure, un match, une série comptée. C'est la seule chose qui rapporte quoi qu'il arrive."
			},
			rounds: {
				title: 'Séries menées à leur terme',
				formula: 'flèches × {xp} × difficulté × forme',
				difficulty: 'difficulté = ({face} ÷ {metres}) ÷ (blason en cm ÷ distance en m), tenue entre {min} et {max}',
				form: 'forme = {floor} + {rest} × (votre score ÷ le maximum possible)',
				body: "Payée en plus des flèches, et seulement une fois la série terminée. La difficulté mesure le blason par rapport à un tir à 18m sur un blason de 40cm, qui vaut donc 1: un blason plus éloigné pour sa taille vaut davantage. La forme ne descend jamais sous {floor}, car une mauvaise série reste une série tirée.",
				example: 'Un WA 720 à 70m à 640 points: 72 × 3 × 1,28 × 0,94 = 260 XP'
			},
			badges: {
				title: 'Badges',
				formula: 'la valeur inscrite sur le badge, une fois',
				body: "Chaque badge vaut sa propre somme, de 100 pour battre le robot débutant à 2500 pour une flèche de progression or. Il rapporte la première fois qu'il est obtenu et plus jamais. S'il tombe lors de la revérification de l'onglet données des réglages, ses points tombent avec lui."
			},
			matches: {
				title: 'Matchs gagnés',
				formula: '{xp} XP × tour × adversaire',
				body: "En plus des flèches que le match a demandées. Le tour va de 1 pour un match hors tableau à 2 pour une finale, et l'adversaire de 0,6 pour le robot débutant à 1,5 pour le professionnel, une personne comptant 1. Un match nul en rapporte {draw}, une défaite rien, et une feuille tenue pour quelqu'un d'autre ne rapporte rien du tout, flèches comprises."
			},
			levels: {
				title: 'Niveaux',
				formula: 'le niveau n commence à {step} × (n − 1)² XP',
				body: "Chaque niveau coûte plus que le précédent, et il n'y a pas de dernier.",
				example: 'Niveau 2 à 100 XP, niveau 10 à 8 100, niveau 20 à 36 100.'
			}
		},
		rateDeterministic: "Rien n'est mis de côté: le total est recalculé sur l'historique tel qu'il est, donc supprimer une session reprend exactement ce qu'elle avait donné."
	},
	badges: {
		title: 'Badges',
		hint: 'Gagnés en tirant et par le travail derrière, gardés une fois acquis.',
		earnedCount: '{n} sur {total} obtenus',
		earnedOn: 'Obtenu le {date}',
		locked: 'Pas encore obtenu',
		progress: '{current} / {target}',
		empty: 'Rien encore obtenu. Va tirer.',
		viewGrid: 'Afficher la grille',
		viewDetail: 'Afficher les règles',
		new: 'Badge obtenu',
		xpWorth: '(+{xp} XP)',
		arrowHint: '36 flèches à {metres} m sur blason de {face} cm, {score} points',
		families: {
			volume: 'Flèches tirées',
			habit: 'Régularité',
			record: 'Records',
			accuracy: 'Précision',
			milestone: 'Premières fois',
			training: 'Entraînement',
			ffta: 'Flèches de progression FFTA'
		},
		list: {
			firstStrength: {
				name: 'Le premier pas',
				hint: 'Terminer une série de renforcement.'
			},
			tenStrengthSessions: {
				name: 'Construit, pas acheté',
				hint: 'Faire {target} séances de renforcement.'
			},
			hundredSets: {
				name: 'Cent séries',
				hint: 'Terminer {target} séries en tout.'
			},
			firstRun: {
				name: 'Premières foulées',
				hint: 'Noter une sortie de course.'
			},
			fiftyKilometres: {
				name: 'Le tour du lac',
				hint: 'Courir 50 km en tout.'
			},
			beatBeginner: {
				name: 'Premier circuit',
				hint: 'Battre le bot débutant.'
			},
			beatAmateur: {
				name: 'Niveau club',
				hint: 'Battre le bot amateur.'
			},
			beatAdvanced: {
				name: 'Assez affûté',
				hint: 'Battre le bot confirmé.'
			},
			beatProfessional: {
				name: 'Briseur de machine',
				hint: 'Battre le bot professionnel.'
			},
			firstMatchWon: {
				name: 'Premier sang',
				hint: 'Gagner un match.'
			},
			tenMatchesWon: {
				name: 'Dix scalps',
				hint: 'Gagner {matches} matchs.'
			},
			comebackWin: {
				name: 'Remontada',
				hint: 'Gagner un match mené de deux sets.'
			},
			halfMarathon: {
				name: 'Le semi-marathon',
				hint: '{arrows} flèches en une seule séance.'
			},
			marathon: {
				name: 'Le marathon',
				hint: '{arrows} flèches en une seule séance.'
			},
			thousandArrows: {
				name: 'Videur de carquois',
				hint: 'Mille flèches décochées.'
			},
			fiveThousandArrows: {
				name: 'Meilleur client du plumassier',
				hint: 'Cinq mille flèches décochées.'
			},
			tenThousandArrows: {
				name: 'Le cauchemar de la botte',
				hint: 'Dix mille flèches décochées.'
			},
			twentyFiveThousandArrows: {
				name: "Bras d'acier",
				hint: 'Vingt cinq mille flèches décochées.'
			},
			threeDaysRunning: {
				name: "Trois jours d'affilée",
				hint: 'Tiré trois jours de suite.'
			},
			fourSeasons: {
				name: 'Les quatre saisons',
				hint: 'Tiré douze mois de suite.'
			},
			groundhogDay: {
				name: 'Un jour sans fin',
				hint: 'Le même tir effectué {rounds} fois.'
			},
			sevenDays: {
				name: 'Récidiviste',
				hint: 'Tiré sur sept jours différents.'
			},
			thirtyDays: {
				name: "Bête d'habitude",
				hint: 'Tiré sur trente jours différents.'
			},
			hundredDays: {
				name: 'Meuble du pas de tir',
				hint: 'Tiré sur cent jours différents.'
			},
			everyWeek: {
				name: 'Jamais un mardi de manqué',
				hint: 'Tiré huit semaines de suite.'
			},
			onPlan: {
				name: 'Fidèle au programme',
				hint: 'Objectif hebdomadaire du programme atteint quatre semaines de suite.'
			},
			threeRecords: {
				name: 'Le frimeur',
				hint: 'Un record personnel sur trois tirs différents.'
			},
			firstXAt70: {
				name: 'La croix des braves',
				hint: 'Un X sur un tir WA à 70 m terminé.'
			},
			thirtyAt18: {
				name: "Brelan d'or",
				hint: 'Une volée à 30 sur un tir WA en salle à 18 m terminé.'
			},
			goldenEnd: {
				name: 'Tout ce qui brille',
				hint: "Une volée entière de six flèches dans l'or, sur un tir terminé."
			},
			handfulOfArrows: {
				name: 'Une poignée de flèches',
				hint: "Une volée de {arrows} flèches pointées tenant dans l'or, sur un tir terminé."
			},
			iSeeRed: {
				name: 'Je vois rouge',
				hint: 'Un tir terminé sans aucune flèche sous {value}.'
			},
			tourist: {
				name: 'Le touriste',
				hint: 'Tiré dans cinq lieux différents.'
			},
			frostbite: {
				name: 'Les doigts gelés',
				hint: 'Un tir terminé à {metres} m ou plus par moins de {temp} °C.'
			},
			firstCompetition: {
				name: "Nerfs d'acier",
				hint: 'Un tir terminé en compétition.'
			},
			twoBowTypes: {
				name: "Cœur d'artichaut",
				hint: "Un tir marqué avec deux types d'arc."
			},
			seventyMetres: {
				name: 'La longue marche',
				hint: 'Un tir terminé à 70 m ou plus.'
			},
			ninetyMetres: {
				name: 'Prévois le casse-croûte',
				hint: 'Un tir terminé à 90 m ou plus.'
			},
			firstTuning: {
				name: 'Touche-à-tout',
				hint: 'Une procédure de réglage menée à bien.'
			},
			fiveSightMarks: {
				name: 'Le murmureur de viseur',
				hint: 'Cinq repères de viseur sur un arc.'
			},
			stormArcher: {
				name: 'Avis de tempête',
				hint: 'Un tir terminé à {metres} m ou plus par un vent de {kmh} km/h ou plus.'
			},
			fftaWhite: { name: 'Flèche blanche' },
			fftaBlack: { name: 'Flèche noire' },
			fftaBlue: { name: 'Flèche bleue' },
			fftaRed: { name: 'Flèche rouge' },
			fftaYellow: { name: 'Flèche jaune' },
			fftaBronzeRecurve: { name: 'Flèche bronze Classique' },
			fftaSilverRecurve: { name: 'Flèche argent Classique' },
			fftaGoldRecurve: { name: 'Flèche or Classique' },
			fftaBronzeCompound: { name: 'Flèche bronze Poulies' },
			fftaSilverCompound: { name: 'Flèche argent Poulies' },
			fftaGoldCompound: { name: 'Flèche or Poulies' }
		}
	},
	// La page d’accueil sur appchery.com, qui est une compilation à part : voir site/ et vite.site.config.ts.
	site: {
		open: 'Ouvrir l’appli',
		openLong: 'Ouvrir Appchery',
		hero: {
			title: 'Tout ce que vous avez fait sur le pas de tir, au même endroit.',
			body: 'Marquez un tir, réglez un arc, comptez les flèches que personne ne compte, préparez le geste. Appchery garde la sortie entière sur votre appareil et fonctionne sans le moindre réseau.',
			session: 'Une sortie telle que l’appli l’enregistre',
			try: 'Cliquez pour plus de détails',
			free: 'Gratuit, libre, sans compte',
			offline: 'Fonctionne hors ligne'
		},
		plot: {
			title: 'Marquez en montrant la cible',
			body: 'Touchez l’impact et la zone est lue sur la géométrie même qui dessine le blason : ce que vous voyez et ce qui est compté ne peuvent pas diverger. Saisissez les valeurs si c’est plus rapide, la feuille de marque additionne dans les deux cas.',
			note: 'Groupement, dispersion et centre, calculés volée après volée.',
			arrows: 'Flèches',
			score: 'Marqué',
			spread: 'Dispersion'
		},
		camera: {
			title: 'Laissez la caméra lire le blason',
			body: 'Visez la cible et les flèches sont trouvées pour vous. Aussi rapide que d’annoncer les scores et de les saisir, plus rapide que de placer six flèches à la main, et vous obtenez quand même ce que le placement donne : où chaque flèche est tombée, et le groupement qui en découle.',
			note: 'Rien n’est envoyé : la détection tourne sur le téléphone.'
		},
		stats: {
			title: 'Des chiffres qui répondent à une question',
			body: 'Comment un tir évolue sur une saison, dans quelles zones les flèches tombent vraiment, et ce que le vent vous coûte par flèche. Filtrez par arc, par distance, par type de sortie, et toute la page ne répond plus que pour cette tranche.',
			note: 'Comparez ce que vous voulez à ce que vous voulez : cet arc contre celui là, en salle contre en extérieur, cette saison contre la précédente.'
		},
		training: {
			title: 'Travaillez les muscles du geste',
			body: 'Une bibliothèque d’exercices, chacun dessiné par une silhouette qui bouge et reporté sur les muscles qu’il sollicite. La carte est celle sur laquelle le geste lui même est dessiné : vous voyez ce qu’un exercice entraîne et à quel moment du tir il sert.',
			note: 'Avec élastique, avec l’arc, ou avec rien du tout.'
		},
		badges: {
			title: 'Quelque chose à viser',
			body: 'Les flèches de progression fédérales sont suivies depuis vos feuilles de marque, et les jalons comptent les flèches, les distances et le temps que vous avez accepté d’affronter. Un badge non obtenu dit quand même ce qu’il demande et où vous en êtes.',
		},
		private: {
			title: 'Vous gardez la main sur vos données',
			body: 'Tout est écrit sur votre appareil d’abord, et l’appli fonctionne que cela le quitte ou non. La synchronisation est gratuite et entièrement facultative : activez la et vos sorties vous suivent sur votre autre téléphone et chez les archers avec qui vous choisissez de les partager, désactivez la et elles restent là où elles ont été enregistrées.',
			note: 'Aucune publicité, aucun pistage, rien à payer.',
			sync: 'Synchro facultative'
		},
		cta: {
			title: 'Emmenez la sur le pas de tir.',
			body: 'Elle s’ouvre dans le navigateur et s’installe sur l’écran d’accueil depuis là. Aucune inscription.'
		},
		footer: {
			licence: 'Logiciel libre sous licence AGPL.',
			language: 'Langue'
		},
		// La sortie d'exemple dessinée dans les téléphones, inventée plutôt que tirée de vrais scores.
		sample: {
			round: 'WA 720 · 70m',
			end: 'Volée 4 sur 12',
			place: 'Terrain du club',
			when: 'Mardi, 18h30',
			average: 'Moyenne glissante'
		}
	}
};
