GOBBLE - DEPLOIEMENT

Mises a jour courantes : deploy.bat
- git add -A, commit (si necessaire), puis push vers origin/main ;
- message de commit facultatif : deploy.bat correction du chat ;
- sur la VM : fetch Git, reset sur origin/main, installation, build et redemarrage ;
- aucun compactage ni envoi de l'ensemble du dossier local ;
- si le deploiement par archive a retire .git, le premier lancement recree le depot
  depuis https://github.com/pmillet-prog/gobble.git (acces Git requis sur la VM) ;
- les lancements suivants ne recuperent que les objets Git manquants ;
- les .env, bases et donnees runtime de la VM sont conserves, sans git clean ;
- aucun backfill semantique/linguistique automatique ;
- npm ci et le build restent executes sur la VM, avec arret des services pendant
  cette phase pour liberer la RAM ;
- pas de nouvelle sauvegarde ni de rollback automatique pour ce mode.

Mises a jour majeures : deploy-major.bat (ancien deploy.bat sans Git)

A placer a la racine du dossier local Gobble :
- deploy-major.bat
- rollback.bat
- dossier deploy-tools

Principes :
- aucun Git n'est utilise pour deployer ;
- node_modules et dist locaux ne sont pas envoyes ;
- npm ci et npm run build sont executes sur la VM ;
- les .env et donnees runtime restent ceux de la VM ;
- les bases .sqlite/.db presentes dans data/ et server/data/ restent celles de la VM et ne sont pas remplacees par une copie locale ;
- AUCUN backfill semantique/linguistique n'est lance automatiquement ;
- une sauvegarde de la version precedente est gardee dans ~/gobble_backup ;
- rollback.bat permet de revenir a cette sauvegarde du dernier deploy-major.bat,
  pas a la version precedant le dernier deploy.bat Git.

Le dossier de production reste ~/gobble_git pour conserver les chemins des services
systemd. Le mode archive conserve le dossier .git de la VM s'il existe afin de
permettre le prochain deploiement Git incremental.

Les deux modes redemarrent Gobble et interrompent les parties en cours.
Le journal du dernier deploiement est disponible dans deploy-vm.log.
