@echo off
cd /d %~dp0
start yarn start
timeout /t 1
start http://localhost:3000/
start http://localhost:3000/
start http://localhost:3000/
start http://localhost:3000/
pause 

//这是快速启动脚本, 可以快速启动游戏, 并且打开3个本地浏览器窗口