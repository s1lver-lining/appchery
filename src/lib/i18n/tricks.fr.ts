import type { TricksDictionary } from './tricks.en';

export const tricksFr: TricksDictionary = {
	title: 'Astuces',
	lead: 'Ce que l’app fait sans jamais l’annoncer à l’écran. Tout ici s’atteint à la main : c’est une liste de raccourcis, pas de réglages cachés.',
	groups: [
		{
			key: 'home',
			title: 'Accueil',
			tricks: [
				{
					lead: 'Changer ce que comptent les deux chiffres.',
					body: 'Appuyez longuement sur l’un des deux chiffres de l’en-tête, ou faites un clic droit, et choisissez parmi plusieurs options.'
				},
				{
					lead: 'Faire vibrer la cible.',
					body: 'Touchez les anneaux en haut à droite de l’en-tête de l’accueil pour rejouer l’onde.'
				},
				{
					lead: 'Écarter un record.',
					body: 'La carte du nouveau record porte une petite croix. L’écarter revient à dire « je sais » : la carte revient au prochain record, sur un autre tir.'
				}
			]
		},
		{
			key: 'sessions',
			title: 'Séances',
			tricks: [
				{
					lead: 'Mesurer la semaine face à vos programmes.',
					body: 'Le menu à trois points de la liste des séances active l’objectif hebdomadaire. La pastille de chaque semaine affiche alors 72/230 flèches, en comptant les objectifs des créneaux et les flèches libres de chaque programme. Une semaine qui atteint son objectif passe à la couleur de l’app.'
				},
				{
					lead: 'L’onglet séances retrouve aujourd’hui.',
					body: 'La liste s’ouvre sur aujourd’hui, puis reste où vous l’avez laissée : revenir d’une séance vous rend la semaine que vous lisiez. Touchez l’onglet séances alors que la liste est déjà affichée pour être ramené à aujourd’hui, qui s’illumine à l’arrivée.'
				},
				{
					lead: 'La recherche lit toute la sortie.',
					body: 'Le champ au-dessus de la liste cherche dans le nom d’une séance, son lieu, ses notes et le nom de chaque tir et de chaque procédure qui s’y trouve. Chaque mot tapé doit être trouvé quelque part, dans n’importe quel ordre, et les accents sont ignorés.'
				},
				{
					lead: 'Un programme peut être mis de côté.',
					body: 'L’interrupteur en haut d’un programme l’empêche de remplir la liste des séances et de compter ses flèches dans l’objectif hebdomadaire, sans rien supprimer de ce qu’il a déjà produit.'
				},
				{
					lead: 'Le bouton de nouvelle séance a deux formes.',
					body: 'La section affichage des paramètres transforme le bouton plus rond du coin en barre pleine largeur.'
				},
				{
					lead: 'Un créneau planifié ne coûte rien.',
					body: 'Ouvrir une séance qu’un programme réclame n’écrit rien dans la base. Elle devient une vraie séance dès qu’une flèche, une note ou un réglage y est saisi : une semaine que personne n’a tirée ne laisse donc rien à nettoyer.'
				}
			]
		},
		{
			key: 'timer',
			title: 'Chronomètre',
			tricks: [
				{
					lead: 'Le chronomètre dans une activité.',
					body: 'Le chronomètre se cache derrière l’icône d’horloge de tout en-tête d’activité et dans le menu des séances. Il connaît les temps World Archery : quatre minutes pour six flèches, deux pour trois, deux pour les six d’une équipe, quatre-vingts secondes pour une équipe mixte, vingt en tir alterné.'
				},
				{
					lead: 'Deux coups, un coup, trois coups.',
					body: 'Appeler la ligne sonne deux coups de sifflet, puis un, puis lance le chrono ; zéro en sonne trois. Les sons sont synthétisés sur l’appareil plutôt qu’enregistrés, donc rien n’est livré qui appartienne à quelqu’un d’autre, et ils peuvent être coupés.'
				},
				{
					lead: 'Les temps vous appartiennent.',
					body: 'Les temps du règlement sont le point de départ, et la feuille d’édition met n’importe lequel sur un autre nombre de secondes. Vider un champ rétablit la règle.'
				},
				{
					lead: 'Le chrono se lit, il ne bat pas.',
					body: 'Le temps restant est calculé depuis l’instant du départ : un téléphone qui a dormi la moitié d’une volée se réveille avec le bon nombre, et l’écran reste allumé tant qu’il tourne.'
				}
			]
		},
		{
			key: 'matches',
			title: 'Matchs',
			tricks: [
				{
					lead: 'Un match se gagne, il ne se score pas.',
					body: 'Le nombre porté par une carte de match, ce sont ses points de set, et il n’atteint jamais vos records ni vos moyennes de tir. Ses flèches comptent tout de même comme flèches tirées.'
				},
				{
					lead: 'Les totaux d’abord, les flèches s’il y a le temps.',
					body: 'Une volée ne demande que les deux totaux, parce qu’un match se tire à la pendule. Touchez plutôt une case et le clavier monte sous la feuille, en remplissant notre côté puis le leur ; taper un total ensuite efface les flèches de ce côté, un nombre ne pouvant pas avoir deux sources. Le clavier et le blason sont le même bouton que sur la page de score.'
				},
				{
					lead: 'Tenir la carte pour quelqu’un d’autre.',
					body: 'L’interrupteur des réglages du match dit que ces flèches ne sont pas les vôtres : plus rien de la carte n’atteint alors votre volume ni vos badges.'
				},
				{
					lead: 'Corriger une volée une fois le match fini.',
					body: 'Tout est recalculé depuis les volées à chaque fois : corriger la volée deux déplace le vainqueur, les flèches comptées et les badges avec.'
				},
				{
					lead: 'Tirer contre l’app.',
					body: 'Un match peut se jouer contre un bot, à l’un de ses quatre niveaux. Il tire de vraies flèches dans le blason plutôt que de choisir un nombre, donc son groupement ressemble à un groupement, et il répond dès que votre volée est entrée. Chaque niveau a son badge à la clé.'
				},
				{
					lead: 'Un tableau est une journée, pas une liste.',
					body: 'Donnez son tour à chaque match et la page de séance dessine l’échelle dans l’ordre où elle a été gravie, des huitièmes à la finale.'
				},
				{
					lead: 'Chaque champ de nom se souvient de tous les noms.',
					body: 'Notre côté, l’adversaire et chaque coéquipier proposent tous ceux déjà inscrits sur une carte, quel que soit leur côté. Un archer affronté une semaine et tiré à vos côtés la suivante reste un seul nom dans l’historique plutôt que trois orthographes.'
				},
				{
					lead: 'Un match se partage aussi en image.',
					body: 'Le bouton de partage construit la même carte qu’un tir : le score du match là où irait le score, et une feuille avec une colonne par côté.'
				},
				{
					lead: 'Deux flèches de barrage à égalité, c’est au juge de trancher.',
					body: 'La carte demande qui a gagné plutôt que de deviner. Placez les deux flèches et elle le déduit de celle qui est la plus proche du centre.'
				}
			]
		},
		{
			key: 'scoring',
			title: 'Score',
			tricks: [
				{
					lead: 'Numéroter les flèches.',
					body: 'La page de score peut marquer chaque flèche de l’ordre dans lequel elle a été saisie, ce qui les distingue une fois la feuille triée du plus haut au plus bas. Les deux interrupteurs sont en bas de la page de score, et fonctionnent aussi sur une carte de match.'
				},
				{
					lead: 'Un tube qui rate sans arrêt est désigné.',
					body: 'Placez vos flèches sur le blason et la page de score surveille chaque flèche de la volée, par la position à laquelle elle a été appelée, face aux autres. Si l’une d’elles se pose toujours à l’écart et que son propre groupement n’est pas pire que le leur, une carte apparaît au-dessus de l’histogramme en disant laquelle et de quel côté. C’est volontairement difficile à déclencher : trois positions pour cette flèche, huit pour les autres, un écart qui vaut un anneau, et toutes ses positions du même côté. Un groupement entier décalé ne dit rien : c’est l’archer ou le viseur, pas le tube.'
				},
				{
					lead: 'La feuille se corrige après coup.',
					body: 'Touchez n’importe quelle flèche déjà saisie pour retaper sa valeur ; touchez le numéro de ligne d’une volée pour rouvrir la volée entière, flèches placées et groupement compris.'
				},
				{
					lead: 'L’annulation a deux niveaux.',
					body: 'Le bouton d’annulation retire la flèche en cours de saisie ; « annuler la dernière volée » retire la volée entière déjà écrite.'
				},
				{
					lead: 'Les flèches libres comptent aussi.',
					body: 'Le compteur d’entraînement de la page de séance enregistre les flèches tirées sans être comptées. Elles comptent dans le volume, les objectifs hebdomadaires et ceux de la séance, et n’atteignent jamais un score.'
				}
			]
		},
		{
			key: 'equipment',
			title: 'Matériel',
			tricks: [
				{
					lead: 'L’onglet matériel ouvre votre arc par défaut.',
					body: 'Avec un arc par défaut, toucher l’onglet matériel y va directement. Touchez l’onglet une seconde fois, maintenez-le, ou passez par le menu à trois points de la page de l’arc, pour atteindre la liste de tous les arcs.'
				},
				{
					lead: 'La section archer appartient à l’arc.',
					body: 'La main d’arc et l’allonge sont rangées avec chaque arc plutôt qu’avec vous, parce que le même archer allonge moins sur un longbow que sur un poulies, et qu’un arc emprunté dans l’autre sens se tire dans l’autre sens. Elles sont versionnées comme tout autre réglage : une allonge modifiée reste dans l’historique.'
				},
				{
					lead: 'Un arc créé depuis une sortie est l’arc de cette sortie.',
					body: 'Sans aucun arc enregistré, la section réglages de l’écran d’ajout propose le formulaire directement. L’arc créé là est affecté à la séance qui l’a demandé, qu’il devienne votre arc par défaut ou non.'
				},
				{
					lead: 'Les repères de viseur se remplissent seuls.',
					body: 'Ajoutez une distance et l’app en déduit la hauteur à partir des repères déjà tirés : trois ou plus sont ajustés par une parabole, deux par une droite. Un repère déduit est en pointillés et précédé d’un tilde. Le toucher vide le champ pour taper le vrai repère par-dessus, et laisser le champ vide ramène l’estimation.'
				},
				{
					lead: 'Les colonnes en plus sont facultatives.',
					body: 'Dérive, clicker et berger se cachent derrière les pastilles sous la liste des repères. Une colonne qui contient des données reste toujours visible, quoi que disent les pastilles.'
				}
			]
		},
		{
			key: 'statistics',
			title: 'Statistiques',
			tricks: [
				{
					lead: 'Épingler les tirs qui comptent pour vous.',
					body: 'L’étoile d’une carte de tir la maintient en haut de la page.'
				},
				{
					lead: 'Au fil du tir.',
					body: 'Ce bloc fait la moyenne de votre score par flèche à chaque position de volée. Il apparaît dès qu’un seul tir est choisi dans les filtres, parce qu’une volée de six flèches et une de trois sont deux questions différentes : c’est le chiffre qui dit si vous lâchez à la neuvième volée.'
				},
				{
					lead: 'Les pastilles se combinent.',
					body: 'Période, tir, arc, type et vent restreignent d’un coup tous les chiffres de la page, et chaque pastille compte ses options en tenant compte des autres, donc aucune option ne mène à une page vide. Ce que la page regarde est retrouvé à la visite suivante.'
				},
				{
					lead: 'Un tir est ce que vous avez tiré, pas le nom que vous lui avez donné.',
					body: 'Les types de tir sont déduits de la distance, du blason, des volées et des flèches qu’elles contiennent : les mêmes douze volées à 70 m sont un seul type, que vous ayez pris le WA 720 dans la liste ou construit le tir à la main. Seules les formes normalisées ont une carte ; une forme d’entraînement unique compte tout de même dans le graphique et reste filtrable.'
				},
				{
					lead: 'Le graphique principal compte toutes les flèches.',
					body: 'Tirs inachevés compris, colorés par type de sortie. Les cartes de tir font l’inverse : uniquement les tirs menés à leur terme, parce qu’un tir abandonné score plus bas pour des raisons qui ne disent rien de votre tir.'
				}
			]
		},
		{
			key: 'badges',
			title: 'Badges',
			tricks: [
				{
					lead: 'Ils vous trouvent.',
					body: 'Les badges sont décernés au fil du tir, et ceux qui tombent en fin de tir s’annoncent avec le feu d’artifice d’un record. Une dernière flèche qui bat un record et gagne deux badges montre les trois cartes sous une seule salve. La liste est derrière le menu à trois points de la page de stats, ou la médaille de la grille de l’app.'
				},
				{
					lead: 'Les flèches hors cible comptent.',
					body: 'Le compteur de flèches de la page de séance alimente les badges de volume et d’assiduité comme n’importe quel tir compté, et un badge gagné par ces flèches s’affiche par-dessus la page de séance.'
				},
				{
					lead: 'Deux façons de lire la liste.',
					body: 'La grille d’icônes est l’affichage par défaut ; le menu à trois points la remplace par la liste, chaque règle écrite en toutes lettres, et retient votre choix. Toucher un badge dans la grille ouvre ce qu’il demande et où vous en êtes, dans les deux cas.'
				},
				{
					lead: 'Un badge est daté du tir, pas de l’app.',
					body: 'Saisissez une vieille séance et tout badge qu’elle gagne apparaît à la date de cette séance, où qu’elle tombe dans la liste.'
				},
				{
					lead: 'Acquis, gardé.',
					body: 'Supprimer une séance ne reprend jamais un badge. Pour que la liste colle exactement à l’historique, la revérification de l’onglet données des paramètres est le bouton qui le fait, et la seule chose dans l’app qui puisse retirer un badge.'
				}
			]
		},
		{
			key: 'sharing',
			title: 'Partage',
			tricks: [
				{
					lead: 'Un tir est une image.',
					body: 'Le bouton de partage de l’en-tête de score ouvre le tir sous forme de carte faite pour être publiée : score, flèches, dix, X, et la forme volée par volée. Un record passe la carte en or et lui ajoute un ruban.'
				},
				{
					lead: 'La page de partage est une affiche.',
					body: 'Le code de la grille de l’app est composé pour être imprimé autant que scanné : l’imprimer donne une feuille A3 en noir et blanc, avec l’adresse écrite sous le code pour qui préfère la taper.'
				}
			]
		},
		{
			key: 'elsewhere',
			title: 'Ailleurs',
			tricks: [
				{
					lead: 'Ouvrez un export CapTarget avec Appchery.',
					body: "Exportez depuis CapTarget et choisissez Appchery dans le menu de partage, ou ouvrez le .xlsx depuis vos fichiers. Réimporter après un export plus récent met à jour ce qui avait été écrit au lieu de le dupliquer, et vos séances saisies ici ne sont jamais touchées."
				},
				{
					lead: "Un score sans les flèches est une activité à part.",
					body: "Le plotting libre et les jeux de score sont enregistrés comme une activité score seul : une distance, un blason, un nombre de flèches et un total. Ses flèches comptent dans votre volume, et son score reste hors des moyennes et des records, faute de volées derrière lui."
				},
				{
					lead: 'Supprimer ne demande rien, et rend tout.',
					body: 'Une séance, un tir ou un match part dès que vous touchez supprimer, et un bandeau au-dessus de la barre d’onglets le propose en retour pendant six secondes. Rien n’est vraiment perdu avant longtemps : une suppression ne fait que masquer la ligne.'
				},
				{
					lead: 'L’app fonctionne sans réseau.',
					body: 'La météo et les noms de lieux ont besoin du réseau au moment où ils sont récupérés ; rien d’autre.'
				}
			]
		}
	]
};
