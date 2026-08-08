import type { Dictionary } from './index';

export const fr: Dictionary = {
	app: {
		name: 'Appchery',
		tagline: 'Suivez vos tirs. Réglez votre arc.'
	},
	nav: {
		sessions: 'Séances',
		equipment: 'Matériel',
		tuning: 'Réglages',
		stats: 'Statistiques',
		settings: 'Paramètres'
	},
	common: {
		start: 'Commencer',
		cancel: 'Annuler',
		save: 'Enregistrer',
		delete: 'Supprimer',
		back: 'Retour',
		undo: 'Annuler',
		done: 'Terminé',
		loading: 'Chargement…',
		none: 'Rien pour le moment'
	},
	sessions: {
		title: 'Séances',
		empty: 'Aucune séance. Commencez-en une pour marquer vos points.',
		new: 'Nouvelle séance',
		chooseRound: 'Choisir un tir',
		inProgress: 'En cours',
		complete: 'Terminée',
		abandoned: 'Abandonnée',
		practice: 'Entraînement',
		competition: 'Compétition',
		qualification: 'Qualification'
	},
	round: {
		arrows: '{n} flèches',
		endsOf: '{ends} volées de {arrows}',
		face: 'blason {size} cm',
		unmarked: 'Distance inconnue',
		max: 'Max {n}'
	},
	score: {
		end: 'Volée {n}',
		endOf: 'Volée {n} sur {total}',
		arrowOf: 'Flèche {n} sur {total}',
		endTotal: 'Total de la volée',
		runningTotal: 'Total cumulé',
		miss: 'M',
		confirmEnd: 'Valider la volée',
		finishSession: 'Terminer la séance',
		tens: '10',
		xs: 'X',
		average: 'Moyenne par flèche',
		tapToScore: 'Touchez une valeur pour chaque flèche'
	},
	storage: {
		volatileWarning:
			"Le stockage n'est pas persistant dans ce navigateur — les scores seront perdus au rechargement. Installez l'application pour un stockage fiable."
	},
	settings: {
		title: 'Paramètres',
		language: 'Langue',
		storage: 'Stockage',
		about: 'À propos'
	}
};
