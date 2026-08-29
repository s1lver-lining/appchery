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
					lead: 'La recherche lit toute la séance.',
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
					lead: 'Travailler sur plusieurs séances à la fois.',
					body: 'Maintenez une séance appuyée, ou faites un clic droit, et la liste passe en sélection : une touche coche la ligne au lieu de l’ouvrir. La barre du bas change alors l’arc de tout ce qui est coché, ou supprime le tout, et le même appui long fonctionne sur les activités d’une séance.'
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
					body: 'Une volée ne demande que les deux totaux, parce qu’un match se tire à la pendule. Touchez plutôt une case et le clavier monte sous la feuille, en remplissant notre côté puis le leur. Taper un total ensuite efface les flèches de ce côté, un nombre ne pouvant pas avoir deux sources.'
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
					body: 'La page de score peut numéroter chaque flèche dans votre ordre de saisie, pour les distinguer même une fois la feuille triée. Les deux interrupteurs sont en bas de la page de score, et fonctionnent aussi sur une carte de match.'
				},
				{
					lead: 'Un tube qui rate sans arrêt est désigné.',
					body: 'Placez vos flèches sur le blason et l’app compare chaque flèche de la volée aux autres. Si l’une se pose toujours à l’écart, une carte au-dessus de l’histogramme dit laquelle et de quel côté. Il faut un écart net et répété pour la déclencher. Un groupement entier décalé ne dit rien : c’est l’archer ou le viseur, pas le tube.'
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
				},
				{
					lead: 'Effacer votre total efface la volée entière.',
					body: 'Sur une carte de match, c’est votre côté qui tient la volée : effacer votre total emporte donc la volée avec lui, le score de votre adversaire compris. Un total laissé à zéro serait sinon lu comme une volée tirée et perdue. Saisissez la volée à nouveau pour la rétablir.'
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
					lead: 'Un arc créé depuis une séance est l’arc de cette séance.',
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
					body: 'Tirs inachevés compris, colorés par type de séance. Les cartes de tir font l’inverse : uniquement les tirs menés à leur terme, parce qu’un tir abandonné score plus bas pour des raisons qui ne disent rien de votre tir.'
				}
			]
		},
		{
			key: 'badges',
			title: 'Badges',
			tricks: [
				{
					lead: 'Ils vous trouvent.',
					body: 'Les badges sont décernés au fil du tir, et ils s’annoncent avec le feu d’artifice d’un record. Le ciel s’illumine à quatre moments: la fin d’un tir, un match gagné, des flèches ajoutées à l’un ou l’autre compteur, et un niveau franchi. Tout ce qu’un même instant a gagné passe sous une seule salve: une dernière flèche qui bat un record, gagne deux badges et fait monter d’un niveau montre les quatre cartes ensemble. La liste est derrière le menu à trois points de la page de stats, ou la médaille de la grille de l’app.'
				},
				{
					lead: 'Une carte dans le ciel ouvre la page qui va avec.',
					body: 'Touchez une carte de badge pendant le feu d’artifice et la liste des badges s’ouvre ; touchez une carte de niveau et c’est la page d’expérience qui s’ouvre. La flèche de retour ramène au tir en cours.'
				},
				{
					lead: 'Les flèches hors cible comptent.',
					body: 'Le compteur de flèches de la page de séance alimente les badges de volume et d’assiduité comme n’importe quel tir compté, et un badge gagné par ces flèches s’affiche par-dessus la page de séance.'
				},
				{
					lead: 'Deux façons de lire la liste.',
					body: 'La grille d’icônes est l’affichage par défaut ; le menu à trois points la remplace par la liste, chaque règle écrite en toutes lettres, et retient votre choix. Toucher un badge ouvre ce qu’il demande et où vous en êtes.'
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
			key: 'experience',
			title: 'Expérience',
			tricks: [
				{
					lead: 'Rien n’est mis de côté.',
					body: 'Les points d’expérience ne sont jamais stockés : le total est recalculé sur votre historique, donc un même historique donne toujours le même niveau, et corriger un score déplace les points avec lui. Les badges font exception, parce que le badge lui-même survit au tir qui l’a gagné.'
				},
				{
					lead: 'Une célébration est retenue par appareil.',
					body: 'L’app retient le dernier niveau pour lequel elle vous a félicité, pour ne jamais annoncer deux fois le même, et abaisse ce repère si une séance supprimée vous coûte un niveau. Pour être félicité de là où vous êtes déjà, « Fêter à nouveau » dans l’onglet données des paramètres oublie tout, niveaux et records compris.'
				},
				{
					lead: 'Le niveau peut tenir l’en-tête.',
					body: 'Maintenez l’un des deux chiffres en haut de la page d’accueil et choisissez le niveau, ou le total d’expérience, à la place d’un compte de flèches.'
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
					lead: 'La médaille du fil n’est pas un record.',
					body: 'Un tir marqué « meilleur partagé » est le plus haut de ce même tir que l’archer a partagé avec vous, rien de plus. Son vrai record est calculé sur son téléphone à partir de tout ce qu’il a tiré, dont l’essentiel ne voyage jamais : le fil ne dit donc que ce qu’il peut réellement voir.'
				},
				{
					lead: 'La page de partage est une affiche.',
					body: 'Le code de la grille de l’app est composé pour être imprimé autant que scanné : l’imprimer donne une feuille A3 en noir et blanc, avec l’adresse écrite sous le code pour qui préfère la taper.'
				}
			]
		},
		{
			key: 'drills',
			title: 'Exercices de tir',
			tricks: [
				{
					lead: 'Reprenez une flèche et l’exercice la reprend avec vous.',
					body: "Annuler retire la dernière volée et la règle est relue sur ce qui reste : une vie perdue revient, une série cassée repart où elle en était. Cela marche même sur un exercice que sa propre règle a terminé : annulez la flèche qui l'a terminé et il rouvre."
				},
				{
					lead: 'Un exercice compte en flèches, jamais en score.',
					body: "Son total dépend de la règle choisie et du nombre de flèches décidé : il ne voudrait rien dire à côté d'un tir compté. Les exercices comptent dans votre volume, votre expérience et vos badges de flèches, et restent hors des moyennes, des records et des comparaisons de tirs."
				},
				{
					lead: 'Les touches que l’exercice ne demande pas restent utilisables.',
					body: "Le clavier estompe les anneaux hors de la zone choisie, et les accepte quand même : une flèche arrivée dans le six est enregistrée comme un six. Un exercice mesure ce que vous avez tiré, il ne le décide pas."
				}
			]
		},
		{
			key: 'training',
			title: 'Entraînement',
			tricks: [
				{
					lead: 'Changer un objectif ne touche pas au travail déjà fait.',
					body: "Modifier les répétitions ou le maintien d'un exercice en cours de séance change toutes les séries que vous n'avez pas encore cochées, et aucune de celles que vous avez faites. Ce qui est enregistré est ce que vous avez réellement fait, série par série, pas ce que la séance prévoyait."
				},
				{
					lead: 'Le repos part de la série, pas de l\'écran.',
					body: "Cochez une série et le repos démarre. Verrouillez le téléphone, mettez le dans une poche et revenez : le décompte se calcule depuis le moment où vous avez coché, donc il est fini quand il doit l'être et non quand la page s'est réveillée."
				},
				{
					lead: 'Une sortie ne demande que ses deux nombres.',
					body: "Entrez une distance et un temps, l'allure se calcule toute seule : la fiche ne peut donc pas afficher une allure que ses propres nombres démentent. Une sortie à moitié notée est enregistrée telle quelle : une distance sans temps reste une sortie que vous avez faite."
				}
			]
		},
		{
			key: 'exercises',
			title: 'Exercices',
			tricks: [
				{
					lead: 'Le schéma s\'ouvre là où le travail se fait.',
					body: "Un exercice montre la face du corps qu'il travaille vraiment, et les deux quand il travaille les deux. Les autres vues restent accessibles d'un geste, gros plans compris, mais aucune n'est celle où la page commence."
				},
				{
					lead: 'Un maintien est dessiné plus court qu\'il n\'est demandé.',
					body: "La silhouette marque un temps d'arrêt sur la position tenue quel que soit le maintien demandé, parce qu'une pause de soixante secondes ressemblerait à un dessin figé plutôt qu'à un long maintien. La durée à respecter est celle indiquée sous Par où commencer."
				}
			]
		},
		{
			key: 'ianseo',
			title: 'Compétitions',
			tricks: [
				{
					lead: 'La recherche va au delà de vos filtres.',
					body: "Les pays que vous suivez décident de ce que la liste affiche, mais taper dans la recherche interroge tout ianseo : chaque compétition qu'il a hébergée, par nom, ville, organisateur ou code. Vider le champ rétablit votre liste."
				},
				{
					lead: "Suivez un archer depuis un résultat.",
					body: "Ouvrez une ligne d'une liste de résultats, ou touchez l'étoile à côté d'un nom dans un tableau, et cet archer est suivi pour cette compétition. Sa ligne est alors marquée partout où elle apparaît, et la compétition est suivie elle aussi."
				},
				{
					lead: "L'accès aux inscriptions, quand il existe.",
					body: "Une compétition française qui prend ses inscriptions par Inscript'Arc porte son formulaire, le mandat du club et la liste des inscrits. Celles que l'application ne peut rattacher à aucune compétition sont regroupées sous Inscriptions ouvertes, en bas de la liste."
				},
				{
					lead: "Un résultat que vous n'avez pas lu le dit.",
					body: "Une compétition suivie que ianseo a reconstruite depuis votre dernière visite est marquée Nouveau dans la liste, et la tuile des compétitions sur l'accueil en porte le nombre. C'est l'ouverture de la compétition qui l'efface."
				},
				{
					lead: "Être averti d'un résultat, application fermée.",
					body: "Sous les compétitions suivies se trouve un interrupteur pour être averti quand l'une d'elles publie. Tout se passe sur l'appareil : le navigateur réveille l'application de temps en temps, pose à ianseo la question que pose déjà la liste, et affiche l'avis lui même. Sans compte, sans rien envoyer nulle part et sans rien à payer. Un téléphone en économie d'énergie peut vérifier rarement, voire pas du tout : c'est le prix de l'absence de serveur."
				},
				{
					lead: 'Tout ce qui est lu est gardé pour le pas de tir.',
					body: "Chaque compétition et chaque résultat ouvert est stocké sur l'appareil et se relit sans réseau. Ce qui est affiché indique toujours quand il a été lu, et ne se fait jamais passer pour du direct."
				},
				{
					lead: 'Trouvez un archer dans une liste de trois cents.',
					body: "Une liste de résultats, une liste d'inscrits et un tableau portent tous une recherche au dessus d'eux. Chaque mot tapé doit apparaître quelque part dans la ligne, dans n'importe quel ordre, et les accents sont ignorés : le nom de famille seul suffit en général. Une compétition qui publie plus de quelques documents se cherche de la même façon, par catégorie ou par type d'arc."
				},
				{
					lead: "Passez une compétition à quelqu'un à côté de vous.",
					body: "Le bouton code sur une compétition la dessine en QR code. Qui le vise avec un téléphone arrive sur la même page : dans Appchery s'il l'a, sur la version web sinon."
				},
				{
					lead: 'Les clubs portent le nom qu\'on leur donne.',
					body: "Une fédération enregistre un club sous un numéro, et ianseo l'imprime : 0702022 - JUSSY. L'application n'affiche que le nom. Le bouton des colonnes porte l'interrupteur pour qui veut le numéro."
				},
				{
					lead: "Choisissez ce qu'affiche un résultat.",
					body: "Le bouton à côté de cette recherche choisit les colonnes. Elles sont retenues par leur intitulé plutôt que par la compétition : masquer les dix et les neuf une fois les masque dans tous les résultats qui les portent."
				},
				{
					lead: 'Ouvrir une ligne rend les colonnes.',
					body: "Un écran étroit montre le classement, l'archer et le score. Les distances, le club et le reste sont derrière la flèche en bout de ligne, là où se trouve aussi la proposition de les suivre."
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
				},
				{
					lead: 'Se connecter adopte ce qui est déjà là.',
					body: 'Le compte est facultatif et arrive tard, volontairement : tout ce que vous avez tiré avant de vous connecter est repris par le compte au moment où vous le faites, au lieu de repartir de zéro. Se déconnecter ne change rien sur l’appareil, et vos tirs restent que vous vous reconnectiez ou non.'
				},
				{
					lead: 'L’identifiant est demandé tard, et une seule fois.',
					body: 'La synchronisation n’a besoin d’aucun identifiant. La page Amis en demande un la première fois que vous l’ouvrez, si bien qu’un archer qui veut seulement ses scores sur deux appareils ne devient jamais trouvable.'
				},
				{
					lead: 'Le partage est un interrupteur, pas une liste.',
					body: 'Une activité est partagée ou elle ne l’est pas, et qui la voit découle de votre profil, public ou privé. L’éteindre la reprend partout, car rien n’a jamais été copié à personne. Le lieu, la météo et l’arc ne voyagent jamais avec.'
				},
				{
					lead: 'Ce que les autres voient de vous est un instantané.',
					body: 'Votre profil affiche vos flèches, vos séances, vos badges et votre niveau à qui peut voir vos partages. C’est votre téléphone qui calcule ces chiffres et les publie en se synchronisant : ils datent donc de votre dernière synchronisation, jamais d’une seconde plus tard.'
				},
				{
					lead: 'Bloquer ne dit rien.',
					body: 'Un archer bloqué voit votre profil exactement comme un profil privé, et peut encore demander à vous suivre. La demande ne vous parvient jamais, et il n’en est pas informé.'
				},
				{
					lead: 'Effacer l’appareil demande d’abord une déconnexion.',
					body: 'Vider ce téléphone et fermer votre compte sont deux gestes distincts, et aucun n’entraîne l’autre. Déconnectez-vous, puis effacez : le compte garde ce qu’il a déjà.'
				}
			]
		}
	]
};
