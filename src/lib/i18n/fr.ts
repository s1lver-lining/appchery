import type { Dictionary } from './index';

export const fr: Dictionary = {
	app: {
		name: 'Appchery',
		tagline: 'Suivez vos tirs. Réglez votre arc.'
	},
	nav: {
		sessions: 'Séances',
		equipment: 'Matériel',
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
		optional: 'facultatif'
	},
	sessions: {
		title: 'Séances',
		empty: 'Aucune séance. Commencez-en une, puis ajoutez-y des activités.',
		new: 'Nouvelle séance',
		open: 'Ouvrir la séance',
		finish: 'Terminer la séance',
		untitled: 'Séance',
		activityCount: '{n} activités',
		oneActivity: '1 activité',
		practice: 'Entraînement',
		competition: 'Compétition',
		qualification: 'Qualification'
	},
	session: {
		bow: 'Arc',
		noBow: 'Non renseigné',
		genericBow: "Type d'arc générique",
		myBows: 'Mes arcs',
		conditions: 'Conditions',
		location: 'Lieu',
		fetchConditions: 'Récupérer le lieu et la météo',
		fetching: 'Récupération…',
		locationDenied: "L'autorisation de localisation est requise pour récupérer les conditions.",
		weatherFailed: 'Météo indisponible. Le lieu a tout de même été enregistré.',
		activities: 'Activités',
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
		max: 'Max {n}',
		custom: 'Tir personnalisé',
		customHint: 'Renseignez le tir que vous effectuez réellement.',
		ends: 'Volées',
		arrowsPerEnd: 'Flèches par volée',
		faceSize: 'Diamètre du blason (cm)',
		distance: 'Distance',
		name: 'Nom',
		create: 'Créer et commencer'
	},
	score: {
		end: 'Volée {n}',
		endOf: 'Volée {n} sur {total}',
		endColumn: 'Volée',
		arrowsColumn: 'Flèches',
		endTotalShort: 'T/V',
		endTotalLong: 'Total de la volée',
		total: 'Total',
		runningTotalLong: 'Total cumulé',
		arrow: 'Flèche',
		miss: 'M',
		finishActivity: "Terminer l'activité",
		tens: '10',
		xs: 'X',
		average: 'Moyenne par flèche',
		tapToScore: 'Touchez une valeur pour chaque flèche.',
		editArrow: 'Modifier la flèche {n} de la volée {end}',
		roundComplete: 'Tir terminé.'
	},
	tuning: {
		title: 'Réglages',
		steps: 'Étapes',
		interpretation: 'Ce que le résultat suggère',
		observation: 'Ce que vous avez observé',
		adjustment: 'Ce que vous avez modifié',
		start: 'Commencer',
		noBowSelected: "Choisissez d'abord un arc dans la séance.",
		forBow: 'Étapes de réglage pour {bow}'
	},
	equipment: {
		title: 'Matériel',
		empty: 'Aucun arc. Ajoutez-en un pour suivre ses réglages et son historique.',
		addBow: 'Ajouter un arc',
		bowName: 'Nom',
		bowType: 'Type',
		tuningSteps: 'Étapes de réglage'
	},
	storage: {
		volatileWarning:
			"Le stockage n'est pas persistant dans ce navigateur. Les scores seront perdus au rechargement : installez l'application pour un stockage fiable."
	},
	settings: {
		title: 'Paramètres',
		language: 'Langue',
		theme: 'Thème',
		themeLight: 'Clair',
		themeDark: 'Sombre',
		themeSystem: 'Système',
		conditions: 'Lieu et météo',
		conditionsHint:
			"Une fois activé, le démarrage d'une séance enregistre le lieu de tir et la météo du moment. L'autorisation de localisation est requise.",
		conditionsEnable: 'Récupérer automatiquement pour les nouvelles séances',
		storage: 'Stockage',
		persistent: 'Persistant',
		volatile: 'En mémoire, perdu au rechargement'
	}
};
