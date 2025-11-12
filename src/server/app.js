const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const Game = require('./game');
const path = require('path');
const database = require('./database');
const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;
app.use('/', express.static(path.join(__dirname, '../client')));

// 存储所有游戏房间
let rooms = [];

// 处理Socket连接
io.on('connection', (socket) => {
  // 处理登录请求
  socket.on('login', (data) => {
    if (!database.some(u => u.Username == data.Username))
      socket.emit('loginResponse', { Error: 1 });
    else if (!database.some(u => u.Username == data.Username && u.Password == data.Password))
      socket.emit('loginResponse', { Error: 2 });
    else 
      socket.emit('loginResponse', { Error: 0, UserData: database.find(u => u.Username == data.Username) });
  });

  // 处理创建房间请求
  socket.on('host', (data) => {
    if (data.Username == '')
      socket.emit('hostRoom', { Error: 1 });
    else if (data.Username.length > 10)
      socket.emit('hostRoom', { Error: 2 });
    else {
      let code;
      do code = '' + Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10) + Math.floor(Math.random() * 10);
      while (rooms.length != 0 && rooms.some((r) => r.Code == code));
      const game = new Game(code, data.Username, data.Mode);
      rooms.push(game);
      game.AddPlayer(data.Username, data.ID, socket);
      socket.emit('hostRoom', {
        Code: code,
        Players: game.Players.map((p) => { return p.Name }),
        Host: game.Host,
        Mode: game.Mode,
        HostChange: false,
        Error: 0
      });
    }
  });

  // 处理加入房间请求
  socket.on('join', (data) => {
    const game = rooms.find((r) => r.Code == data.Code);
    if (data.Username == '')
      socket.emit('joinRoom', { Error: 1 });
    else if (data.Username.length > 10)
      socket.emit('joinRoom', { Error: 2 });
    else if (game == undefined)
      socket.emit('joinRoom', { Error: 3 });
    else if (game.RoundInProgress) {
      if (game.Mode == '1')
        if (game.Players.some((p) => p.Name == data.Username)) socket.emit('joinRoom', { Error: 5 });
        else {
          game.WaitingList.push({ Name: data.Username, ID: data.ID, Socket: socket });
          socket.emit('waitingtojoinRoom', {});
        }
      else if (game.Mode == '2')
        if (game.Players.find((p) => p.Name == data.Username).Disconnected) {
          game.Players.find((p) => p.Name == data.Username).Disconnected = false;
          game.Players.find((p) => p.Name == data.Username).Socket = socket;
          socket.emit('playerJoined', {});
          game.Rerender();
        }
        else socket.emit('joinRoom', { Error: 4 });
    }
    else {
      game.AddPlayer(data.Username, data.ID, socket);
      for (const p of game.Players) {
        if (p.Name === game.Host)
          p.Socket.emit('hostRoom', {
            Code: game.Code,
            Players: game.Players.map((p) => { return p.Name }),
            Host: game.Host,
            Mode: game.Mode,
            HostChange: false,
            ERROR: 0
          });
        else 
          p.Socket.emit('joinRoom', {
            Code: game.Code,
            Players: game.Players.map((p) => { return p.Name }),
            Host: game.Host,
            Mode: game.Mode,
            ERROR: 0
          });
      }
    }
  });

  // 处理断开连接 
  socket.on('disconnect', () => {
    const game = rooms.find(r => r.Players.some(p => p.Socket && p.Socket.id === socket.id));
    if (!game) return;
    const player = game.Players.find(p => p.Socket && p.Socket.id === socket.id);
    if (!player) return;
    player.IsDisconnected = true;
    if (game.RoundInProgress) {
      if (!game.Players.some(p => p.Name == player.Name))
        game.WaitingList = game.WaitingList.filter(p => p.Name != player.Name);
      else {
        game.Log(`玩家 ${player.Name} 掉线`);
        player.Disconnected = true;
        if (player.Status == 'Action') {
          player.Status = 'Fold';
          player.Options = [];
          game.LastMovePosition = player.Position;
          let nonFoldPlayer = [];
          for (let p of game.Players) if (p.Status != 'Fold') nonFoldPlayer.push(p);
          if (nonFoldPlayer.length == 1) game.RoundOver(nonFoldPlayer, 1);
          else game.MovetoNextPlayer();
        }
      }
    }
    else {
      game.Players = game.Players.filter(p => p.Name !== player.Name);
      if (game.Players.length === 0) {
        game.Log('房间已空，关闭房间');
        rooms = rooms.filter(r => r.Code !== game.Code);
        return;
      }
      if (player.Name === game.Host) {
        game.Host = game.Players[0].Name;
        game.Log(`房主 ${player.Name} 掉线，新的房主为 ${game.Host}`);
      }
      else game.Log(`玩家 ${player.Name} 掉线，已将其移出房间`);
      for (const p of game.Players) {
        if (p.Name === game.Host)
          p.Socket.emit('hostRoom', {
            Code: game.Code,
            Players: game.Players.map((p) => { return p.Name }),
            Host: game.Host,
            Mode: game.Mode,
            HostChange: true,
            ERROR: 0
          });
        else 
          p.Socket.emit('joinRoom', {
            Code: game.Code,
            Players: game.Players.map((p) => { return p.Name }),
            Host: game.Host,
            Mode: game.Mode,
            ERROR: 0
          });
      } 
    }
  });

  // 处理开始游戏请求
  socket.on('start', (data) => {
    const game = rooms.find((r) => r.Code == data.Code);
    game.EmitToPlayers('gameStart', {});
    game.StartGame();
  });

  // 处理玩家操作
  socket.on('action', (data) => {
    const game = rooms.find((r) => r.Players.some(p => p.Socket && p.Socket.id === socket.id));
    if (!game) return;
    const player = game.Players.find(p => p.Socket && p.Socket.id === socket.id);
    if (!player) return;
    if (data.Action == 'Fold') {
      game.Log('玩家弃牌：' + player.Name);
      player.Status = 'Fold';
      player.Options = [];
      game.LastMovePosition = player.Position;
      let nonFoldPlayer = [];
      for (let p of game.Players) if (p.Status != 'Fold') nonFoldPlayer.push(p);
      if (nonFoldPlayer.length == 1) game.RoundOver(nonFoldPlayer, 1);
      else game.MovetoNextPlayer();
    }
    else if (data.Action == 'Check') {
      game.Log('玩家过牌：' + player.Name);
      player.Status = 'Check';
      player.Options = [];
      game.LastMovePosition = player.Position;
      game.MovetoNextPlayer();
    }
    else if (data.Action == 'Call') {
      game.Log('玩家跟注：' + player.Name);
      player.Status = 'Call';
      player.Options = [];
      game.LastMovePosition = player.Position;
      player.Money -= game.TopBet - player.Bet;
      player.Bet = game.TopBet;
      game.MovetoNextPlayer();
    }
    else if (data.Action == 'Bet') {
      game.Log('玩家下注：' + player.Name + '，金额：' + data.Amount);
      player.Options = [];
      game.LastMovePosition = player.Position;
      player.Money -= data.Amount;
      player.Status = player.Money == 0 ? 'All-In' : 'Bet';
      player.Bet = data.Amount;
      game.TopBet = player.Bet;
      game.NextBet = 2 * player.Bet;
      game.MovetoNextPlayer();
    }
    else if (data.Action == 'Raise') {
      game.Log('玩家加注：' + player.Name + '，金额：' + data.Amount);
      player.Options = [];
      game.LastMovePosition = player.Position;
      player.Money -= data.Amount - player.Bet;
      player.Status = player.Money == 0 ? 'All-In' : 'Raise';
      player.Bet = data.Amount;
      game.NextBet = 2 * player.Bet - game.TopBet;
      game.TopBet = player.Bet;
      game.MovetoNextPlayer();
    }
    else if (data.Action == 'All-In') {
      game.Log('玩家全下：' + player.Name);
      player.Status = 'All-In';
      player.Options = [];
      game.LastMovePosition = player.Position;
      player.Bet += player.Money;
      player.Money = 0;
      game.MovetoNextPlayer();
    }
    else if (data.Action == 'Show') {
      player.ShowCards = true;
      player.Options = [];
      game.Rerender();
    }
  });
});

// 启动服务器
server.listen(PORT, () => console.log(`正在端口 ${PORT} 运行`));