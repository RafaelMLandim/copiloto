@echo off
title Copiloto - painel
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
echo Gerando a interface...
call npx vite build
start "" http://127.0.0.1:3333
call npm start
pause
