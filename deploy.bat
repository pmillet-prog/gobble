@echo off
set VM_USER=freebox
set VM_IP=192.168.1.84
set REMOTE_PATH=/home/freebox/gobble

echo === BUILD FRONT (VITE) ===
call npm run build

echo === NETTOYAGE DOSSIER DISTANT ===
ssh %VM_USER%@%VM_IP% "rm -rf %REMOTE_PATH% && mkdir -p %REMOTE_PATH%"

echo === ENVOI DES FICHIERS ===
scp -r server %VM_USER%@%VM_IP%:~/gobble/
scp start.sh %VM_USER%@%VM_IP%:~/gobble/

echo === INSTALL DEPENDANCES SERVEUR ===
ssh %VM_USER%@%VM_IP% "cd %REMOTE_PATH%/server && npm install --production"

echo === REDÉMARRAGE SERVEUR ===
ssh %VM_USER%@%VM_IP% "cd %REMOTE_PATH% && ./start.sh"

echo === DEPLOIEMENT TERMINE ===
pause
