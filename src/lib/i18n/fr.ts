import type { Dictionary } from './index';

export const fr: Dictionary = {
	app: {
		name: 'Appchery',
		tagline: 'Suivez vos tirs. Réglez votre arc.',
		exitTitle: 'Fermer Appchery ?',
		exitBody: 'Tout est déjà enregistré sur cet appareil.',
		exitAction: 'Fermer'
	},
	nav: {
		home: 'Accueil',
		sessions: 'Séances',
		equipment: 'Matériel',
		stats: 'Stats',
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
		scoringGroup: 'Tir compté',
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
	round: {
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
		customHint: 'Renseignez le tir que vous effectuez réellement.',
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
		undoEnd: 'Annuler la dernière volée',
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
	tuning: {
		title: 'Réglages',
		guideTitle: 'Étapes de réglage',
		diagram: {
			equalGaps: 'écarts égaux',
			downString: 'vu le long de la corde',
			stringLine: 'corde',
			button: 'bouton',
			insideCentre: '1 à 2 mm en dedans',
			upper: 'haut',
			lower: 'bas',
			tillerFormula: 'tiller = haut − bas',
			aboutHalf: 'environ 0,5 cm',
			squareOnRest: 'équerre sur le repose-flèche',
			stiff: 'raide',
			weak: 'faible',
			nockLow: 'encochage bas',
			nockHigh: 'encochage haut',
			tailHigh: 'queue haute',
			tailLow: 'queue basse',
			tailLeft: 'queue à gauche',
			tailRight: 'queue à droite'
		},
		guideHint:
			'L’ordre dans lequel on règle un arc. Chaque étape suppose les précédentes déjà justes.',
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
		interpretation: 'Ce que le résultat suggère',
		observation: 'Ce que vous avez observé',
		adjustment: 'Ce que vous avez modifié',
		start: 'Commencer',
		noBowSelected: "Choisissez d'abord un arc dans la séance.",
		forBow: 'Étapes de réglage pour {bow}'
	},
	equipment: {
		title: 'Liste du matériel',
		empty: 'Aucun arc. Ajoutez-en un pour suivre ses réglages et son historique.',
		addBow: 'Ajouter un arc',
		bowName: 'Nom',
		bowType: 'Type',
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
			reset: 'Tout effacer',
			clearOne: 'Effacer',
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
		barLabel: '{arrows} flèches sur {rounds} tirs',
		scaleHint: 'du plus ancien au plus récent',
		byKind: 'Score selon le type de session',
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
		bestOn: 'Record le {date}',
		spread: 'Écart',
		distribution: 'Où les flèches sont parties',
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
			kind: 'Score selon le type de session',
			bests: 'Records personnels',
			wind: 'Score selon le vent',
			byEnd: 'Au fil du tir',
			bow: "Score selon l'arc",
			temperature: 'Score selon la température',
			partOfDay: 'Score selon le moment de la journée',
			weekday: 'Score selon le jour de la semaine',
			place: 'Score selon le lieu',
			distribution: 'Où les flèches sont parties',
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
	backup: {
		title: 'Sauvegarde',
		hint: 'Tout est stocké sur cet appareil uniquement. Exportez un fichier à conserver ailleurs.',
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
	storage: {
		volatileWarning:
			"Le stockage n'est pas persistant dans ce navigateur. Les scores seront perdus au rechargement : installez l'application pour un stockage fiable."
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
		milliseconds: '{n} ms',
		display: 'Affichage',
		recordTitle: 'Enregistrer la vidéo du marquage',
		recordHint:
			"Enregistre sur cet appareil une vidéo de chaque marquage à la caméra, pour améliorer la détection. Rien n'est envoyé.",
		recordPath:
			"Les vidéos sont enregistrées sur cet appareil, une par volée, nommées d'après l'activité et la volée correspondantes. Récupérez-les par câble ou avec le gestionnaire de fichiers.",
		detectorTitle: 'Détecteur de flèches',
		detectorHint:
			'Méthode de lecture des flèches. Classique par règles de forme et de couleur, apprise par un petit modèle entraîné. Les deux fonctionnent sur cet appareil.',
		detectorClassical: 'Classique',
		detectorLearned: 'Apprise',
		newButtonTitle: 'Bouton de séance complet',
		newButtonHint:
			'Termine la liste des séances par le bouton large et son menu. Désactivé, un bouton rond se place dans le coin et ouvre les mêmes choix.',
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
			green: 'Vert'
		},
		clockTitle: 'Format 24 heures',
		clockHint: 'Afficher 14:30 plutôt que 2:30 PM.',
		placeTitle: 'Nommer le lieu',
		placeHint:
			'Recherche la ville la plus proche. Vos coordonnées sont envoyées à un tiers, ce que leur enregistrement local ne fait pas.',
		storage: 'Stockage',
		persistent: 'Persistant',
		volatile: 'En mémoire, perdu au rechargement',
		linkBadges: 'Badges',
		recalcTitle: 'Revérifier les badges',
		recalcHint:
			'Un badge acquis est conservé. La vérification le confronte aux tirs encore enregistrés : tout badge dont les tirs ont disparu est retiré.',
		recalcAction: 'Vérifier',
		recalcResult: '{awarded} obtenus, {revoked} retirés.'
	},
	badges: {
		title: 'Badges',
		hint: 'Gagnés en tirant, gardés une fois acquis.',
		earnedCount: '{n} sur {total} obtenus',
		earnedOn: 'Obtenu le {date}',
		locked: 'Pas encore obtenu',
		progress: '{current} / {target}',
		empty: 'Rien encore obtenu. Va tirer.',
		viewGrid: 'Afficher la grille',
		viewDetail: 'Afficher les règles',
		new: 'Badge obtenu',
		arrowHint: '36 flèches à {metres} m sur blason de {face} cm, {score} points',
		families: {
			volume: 'Flèches tirées',
			habit: 'Régularité',
			record: 'Records',
			accuracy: 'Précision',
			milestone: 'Premières fois',
			ffta: 'Flèches de progression FFTA'
		},
		list: {
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
	}
};
