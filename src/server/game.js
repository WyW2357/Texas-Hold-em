const fs = require('fs');               // 引入文件系统模块
const path = require('path');           // 引入路径处理模块
const database = require('./database'); // 引入数据库模块

// 卡牌类：标准52张扑克牌中1张牌的表示
const Card = function (value, suit) {
  this.Value = value;
  this.Suit = suit;
  this.ImgPath = `./img/cards/${value}_${suit}.png`;
};

// 牌组类：标准52张扑克牌牌组的表示
const Deck = function () {
  this.Cards = [];

  // 洗牌方法
  this.ShuffleCards = () => {
    this.Cards = [];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 13; j++)
        this.Cards.push(new Card(j , i));
  };

  // 发牌方法
  this.DealRandomCard = () => {
    const index = Math.floor(Math.random() * this.Cards.length);
    const card = this.Cards[index];
    this.Cards.splice(index, 1);
    return card;
  };
};

// 玩家类：表示游戏中的一个玩家
const Player = function (name, id, socket) {
  this.Name = name;      // 玩家游戏名
  this.UserID = id;      // 玩家用户名
  this.Socket = socket;  // 玩家的socket连接
  this.Cards = [];       // 玩家手牌
  this.Money = 0;        // 玩家筹码数量
  this.BuyIn = 0;        // 玩家买入次数
  this.Status = '';      // 玩家当前状态
  this.Blind = '';       // 玩家盲注状态
  this.Position = 0;     // 玩家位置
  this.Hand = null;      // 玩家当前手牌信息
  this.Bet = 0;          // 玩家当前下注金额
  this.Invest = 0;       // 玩家总下注
  this.Gain = 0;         // 玩家局收益
  this.Options = [];     // 玩家当前可选动作
  this.Grade = null;     // 玩家当前成绩数据
  this.ShowCards = false;      // 玩家摊牌状态
  this.Disconnected = false;   // 玩家断线状态
};

// 游戏类：游戏主体逻辑
const Game = function (code, host, mode) {
  this.Code = code;               // 游戏房间号
  this.Host = host;               // 设置房主
  this.Mode = mode;               // 游戏模式
  this.Players = [];              // 存储当前游戏中的玩家
  this.Deck = new Deck();         // 创建新的牌组实例
  this.Community = [];            // 公共牌区
  this.BetsPool = 0;              // 当前下注池总额
  this.TopBet = 0;                // 当前最高下注金额
  this.NextBet = 0;               // 下次加注最低值
  this.BlindSet = [1,2];          // 盲注设置
  this.MoneySet = [50,100];       // 初始筹码设置
  this.PtSet = [0,10];            // 锦标赛积分设置
  this.Dealer = 0;                // 当前庄家玩家
  this.RoundNum = 1;              // 当前回合数
  this.StageNum = 1;              // 当前阶段数
  this.LastMovePosition = null;   // 上一次行动玩家
  this.RoundInProgress = false;   // 回合进行状态
  this.WaitingList = [];          // 等待加入的玩家列表
  this.LogQueue = [];             // 日志队列
  this.IsWriting = false;         // 日志写入锁

  // 清空同名数据文件
  const logFile = path.join(__dirname, `../../game_records/${this.Code}.txt`);
  fs.writeFile(logFile, '', (err) => {
    if (err) console.error('清空日志文件失败：', err);
    else {
      this.Log('==== 新房间 ====');
      this.Log('房间号：' + this.Code, '房主：' + this.Host);
      this.Log('================');
    }
  });

  // 日志记录方法
  this.Log = (...args) => {
    const logMessage = args.join(' ') + '\n';
    this.LogQueue.push(logMessage);
    if (!this.IsWriting) this.WriteLog();
  };

  // 日志写入方法
  this.WriteLog = () => {
    if (this.LogQueue.length === 0) {
      this.IsWriting = false;
      return;
    }
    this.IsWriting = true;
    const logMessage = this.LogQueue.shift();
    fs.appendFile(logFile, logMessage, (err) => {
      if (err) console.error('写入日志文件失败：', err);
      this.WriteLog();
    });
  };

  // 延时函数
  function delay (ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // 添加玩家方法
  this.AddPlayer = (name, id, socket) => {
    const player = new Player(name, id, socket);
    this.Players.push(player);
    this.Log('玩家加入：' + name + ' (ID: ' + id + ')');
  };

  // 向所有玩家发送消息的方法
  this.EmitToPlayers = (eventname, data) => {
    this.Players.forEach((player) => {
      player.Socket.emit(eventname, data);
    });
  };

  // 重新渲染游戏状态方法
  this.Rerender = () => {
    for(let player of this.Players)
      player.Socket.emit('rerender', {
        Players: this.Players.map((p) => {
          return {
            Name: p.Name,
            Cards: p.ShowCards ? p.Cards : [],
            Hand: p.ShowCards && p.Hand ? p.Hand.rank : null,
            Money: p.Money,
            BuyIn: p.BuyIn,
            Status: p.Status,
            Blind: p.Blind,
            Position: p.Position,
            Bet: p.Bet,
            Invest: p.Invest,
            Gain: p.Gain,
            Grade: p.Grade,
            Disconnected: p.Disconnected
          };
        }),
        Mode: this.Mode,
        Community: this.Community,
        BetsPool: this.BetsPool,
        BlindSet: this.BlindSet,
        RoundNum: this.RoundNum,
        StageNum: this.StageNum,
        TopBet: this.TopBet,
        NextBet: this.NextBet,
        MyCards: player.Cards,
        MyName: player.Name,
        MyHand: player.Hand ? player.Hand.rank : null,
        MyOptions: player.Options
      });
  };

  // 开始游戏方法
  this.StartGame = () => {
    this.RoundInProgress = true;
    this.Deck.ShuffleCards();
    this.Players.forEach((player) => {
      player.Cards = [this.Deck.DealRandomCard(), this.Deck.DealRandomCard()];
      if (this.Mode == '1') player.Money = this.MoneySet[0];
      else if (this.Mode == '2') {
        player.Money = this.MoneySet[1];
        player.Grade = [this.Players.length, -this.PtSet[1], false];
      }
    });
    this.AssignPosition();
    this.Rerender();
  };

  // 开始下一局方法
  this.StartNextRound = () => {
    this.Deck.ShuffleCards();
    this.Community = [];
    this.RoundNum++;
    this.StageNum = 1;
    if (this.Mode == '1') {
      if (this.WaitingList.length > 0) {
        this.WaitingList.forEach((p) => {
          let newPlayer = new Player(p.Name, p.ID, p.Socket);
          newPlayer.Money = this.MoneySet[0];
          newPlayer.Position = this.Players.length;
          this.Players.push(newPlayer);
          this.Log('玩家加入：' + p.Name + ' (ID: ' + p.ID + ')');
          p.Socket.emit('playerJoined', {});
        });
        this.WaitingList = [];
      }
      do this.Dealer = (this.Dealer + 1) % this.Players.length;
      while (this.Players.find(p => p.Position === this.Dealer).Disconnected)
      let Dealername = this.Players[this.Dealer].Name;
      let DisconnectPlayerName = [];
      this.Players.forEach((p) => {
        if (p.Disconnected) {
          DisconnectPlayerName.push(p.Name);
          database.find(u => u.Username == p.UserID).Money += p.Money - (p.BuyIn + 1) * this.MoneySet[0];
          fs.writeFileSync(path.join(__dirname, 'database.json'), JSON.stringify(database, null, 2), 'utf8');
        }
      });
      this.Players.sort((a, b) => a.Position - b.Position);
      this.Players = this.Players.filter((p) => !p.Disconnected);
      if (DisconnectPlayerName.length > 0) this.EmitToPlayers('playerDisconnected', DisconnectPlayerName );
      if (this.Players.length < 2) {
        this.Players.forEach((p) => {
          database.find(u => u.Username == p.UserID).Money += p.Money - (p.BuyIn + 1) * this.MoneySet[0];
        });
        fs.writeFileSync(path.join(__dirname, 'database.json'), JSON.stringify(database, null, 2), 'utf8');
        this.Log('玩家不足，游戏结束');
        this.EmitToPlayers('gameEnd', {Type : 1});
        return;
      }
      this.Players.forEach((player, index) => {
        player.Position = index;
      });
      this.Dealer = this.Players.find(p => p.Name === Dealername).Position;
    }
    else if (this.Mode == '2') {
      let activePlayers = this.Players.filter((p) => !p.Disconnected);
      if (activePlayers.length < 1) {
        this.Log('玩家不足，游戏结束');
        this.Players.forEach((p) => {
          database.find(u => u.Username == p.UserID).pt += p.Grade[1];
        });
        fs.writeFileSync(path.join(__dirname, 'database.json'), JSON.stringify(database, null, 2), 'utf8');
        this.EmitToPlayers('gameEnd', {Type : 1});
        return;
      }
      let outNum = 0;
      this.Players.forEach((p) => {
        if (p.Money == 0 && !p.Grade[2]) {
          p.Grade[2] = true;
          outNum++;
        }
      });
      this.PtSet[0] += outNum * this.PtSet[1];
      let activePlayerNum = this.Players.filter((p) => !p.Grade[2]).length;
      this.Players.forEach((p) => {
        if (!p.Grade[2]) {
          p.Grade[0] -= outNum;
          p.Grade[1] += (this.PtSet[0] - (this.PtSet[0] % activePlayerNum)) / activePlayerNum;
        }
      });
      this.PtSet[0] = this.PtSet[0] % activePlayerNum;
      if (activePlayerNum == 1) this.Players.find((p) => !p.Grade[2]).Grade[1] += this.PtSet[0] + this.PtSet[1];
      if (this.Players.some((p) => p.Money == this.MoneySet[1] * this.Players.length)) {
        this.Log('有玩家筹码达到上限，游戏结束');
        this.Players.forEach((p) => {
          database.find(u => u.Username == p.UserID).pt += p.Grade[1];
        });
        fs.writeFileSync(path.join(__dirname, 'database.json'), JSON.stringify(database, null, 2), 'utf8');
        this.EmitToPlayers('gameEnd', {Type : 2, Players: this.Players.map((p) => { return {Name: p.Name, Grade: p.Grade}; })});
        return;
      }
      do this.Dealer = (this.Dealer + 1) % this.Players.length;
      while (this.Players.find((p) => p.Position === this.Dealer).Money == 0)
    }
    this.LastMovePosition = null;
    this.Players.forEach((player) => {
      if (this.Mode == '1' && player.Money <= this.BlindSet[1]) {
        player.Money += this.MoneySet[0];
        player.BuyIn += 1;
      } 
      else if (this.Mode == '1' && player.Money > 2 * this.MoneySet[0])
        while (player.Money > 2 * this.MoneySet[0]) {
          player.Money -= this.MoneySet[0];
          player.BuyIn -= 1;
        }
      player.Cards = player.Money > 0 ? [this.Deck.DealRandomCard(), this.Deck.DealRandomCard()] : [];
      player.Bet = 0;
      player.Status = player.Money == 0 ? 'Fold' : '';
      player.Blind = '';
      player.Hand = null;
      player.Options = [];
      player.Invest = 0;
      player.Gain = 0;
      player.ShowCards = false;
    });
    this.AssignBlind();
    this.Rerender();
  };

  // 移动到下一个玩家方法
  this.MovetoNextPlayer = async function() {
    if (this.IsStageComplete()) {
      this.Players.forEach((p) => {
        this.BetsPool += p.Bet;
        p.Invest += p.Bet;
        p.Bet = 0;
      });
      this.Rerender();
      await delay(1000);
      let nonAllInPlayers = 0;
      for (let player of this.Players) if (player.Status != 'Fold' && player.Status != 'All-In') nonAllInPlayers++;
      if (nonAllInPlayers <= 1) {
        this.Players.forEach((p) => {
          if (p.Status != 'Fold') p.ShowCards = true;
        });
        await delay(1000);
        if (this.StageNum == 1) {
          this.Community.push(this.Deck.DealRandomCard());
          this.Community.push(this.Deck.DealRandomCard());
          this.Community.push(this.Deck.DealRandomCard());
          this.EvaluateHands();
          this.StageNum++;
          this.Rerender();
          await delay(2000);
        }
        if (this.StageNum == 2) {
          this.Community.push(this.Deck.DealRandomCard());
          this.EvaluateHands();
          this.StageNum++;
          this.Rerender();
          await delay(2000);
        }
        if (this.StageNum == 3) {
          this.Community.push(this.Deck.DealRandomCard());
          this.EvaluateHands();
          this.StageNum++;
          this.Rerender();
          await delay(2000);
        }
        if (this.StageNum == 4) {
          this.StageNum++;
          this.EvaluateHands();
          this.RoundOver([], 2);
        }
      }
      else this.UpdateStage();
    } else {
      let index = this.LastMovePosition;
      do {
        index = (index + 1) % this.Players.length;
        if (this.Players.find((p) => p.Position == index).Disconnected) {
          this.Log('玩家断线，自动弃牌：' + this.Players.find((p) => p.Position == index).Name);
          this.Players.find((p) => p.Position == index).Status = 'Fold';
          let nonFoldPlayer = [];
          for (let p of this.Players) if (p.Status != 'Fold') nonFoldPlayer.push(p);
          if (nonFoldPlayer.length == 1) {
            this.RoundOver(nonFoldPlayer, 1);
            return;
          }
        }
      }
      while (this.Players.find((p) => p.Position == index).Status == 'Fold' || this.Players.find((p) => p.Position == index).Status == 'All-In' || this.Players.find((p) => p.Position == index).Money == 0);
      if (this.IsStageComplete()) {
        this.UpdateStage();
        return;
      }
      this.Players.find((p) => p.Position == index).Status = 'Action';
      this.SetOptions();
      this.Rerender();
    }
  };

  // 本轮结束方法
  this.RoundOver = async function(winners, status) {
    if (status == 1) {
      this.Players.forEach((p) => {
        this.BetsPool += p.Bet;
        p.Invest += p.Bet;
        p.Bet = 0;
      });
      this.Rerender();
      await delay(1000);
      let winner = winners[0];
      winner.Money += this.BetsPool;
      winner.Gain += this.BetsPool;
    }
    else if (status == 2) {
      let canwinPlayers = this.Players.filter((p) => p.Status != 'Fold');
      canwinPlayers.forEach((p) => {
        p.ShowCards = true;
      });
      this.Rerender();
      await delay(1000);
      let currentBet = 0;
      let previousBet = 0;
      while (canwinPlayers.length > 0) {
        let winners = [];
        let highestHandscore = -1;
        for (const p of canwinPlayers) if (p.Hand.score > highestHandscore) highestHandscore = p.Hand.score;
        for (const p of canwinPlayers) if (p.Hand.score == highestHandscore) winners.push(p);
        winners.sort((a, b) => a.Invest - b.Invest);
        previousBet = currentBet;
        currentBet = winners[0].Invest;
        const winnerPot = this.Players.reduce((acc, cur) => {
          const contribution = Math.max(0, Math.min(cur.Invest, currentBet) - previousBet);
          return acc + contribution;
        }, 0);
        const baseAmount = Math.floor(winnerPot / winners.length);
        for (const winner of winners) {
          winner.Money += baseAmount;
          winner.Gain += baseAmount;
        }
        const remainder = winnerPot % winners.length;
        let position = this.Dealer;
        while (remainder > 0) {
          if (winners.some((p) => p.Position == position)) {
            winners.find((p) => p.Position == position).Money += 1;
            winners.find((p) => p.Position == position).Gain += 1;
            remainder--;
          }
          position = (position + 1) % this.Players.length;
        }
        canwinPlayers = canwinPlayers.filter((p) => p.Invest > currentBet);
      }
    }
    this.BetsPool = 0;
    this.Players.forEach((p) => {
      if (!p.ShowCards && p.Cards.length > 0) p.Options = ['Show'];
      else p.Options = [];
      p.Bet = p.Gain - p.Invest;
    });
    this.Rerender();
    await delay(8000);
    this.StartNextRound();
  };

  // 检查当前阶段是否完成方法
  this.IsStageComplete = () => {
    let activePlayers = this.Players.filter((p) => p.Status != 'Fold' && p.Status != 'All-In');
    for (let player of activePlayers) if (player.Bet != this.TopBet || player.Status == '') return false;
    return true;
  };

  // 更新阶段方法
  this.UpdateStage = async function() {
    this.Players.forEach((p) => {
        this.BetsPool += p.Bet;
        p.Invest += p.Bet;
        p.Bet = 0;
        if (p.Status != 'Fold' && p.Status != 'All-In') p.Status = '';
    });
    this.Rerender();
    await delay(1000);
    if (this.StageNum == 1) {
      this.Community.push(this.Deck.DealRandomCard());
      this.Community.push(this.Deck.DealRandomCard());
      this.Community.push(this.Deck.DealRandomCard());
    } 
    else if (this.StageNum == 2) this.Community.push(this.Deck.DealRandomCard());
    else if (this.StageNum == 3) this.Community.push(this.Deck.DealRandomCard()); 
    else if (this.StageNum == 4) {
        this.StageNum++;
        this.EvaluateHands();
        this.RoundOver([], 2);
        return;
    }
    this.LastMovePosition = null;
    this.StageNum++;
    this.TopBet = 0;
    let SmallBlindPlayer = this.Players.find((p) => p.Blind == 'Small Blind');
    let index = SmallBlindPlayer.Position;
    if (SmallBlindPlayer.Disconnected && SmallBlindPlayer.Status != 'Fold' && SmallBlindPlayer.Status != 'All-In') {
      this.Log('玩家断线，自动弃牌：' + SmallBlindPlayer.Name);
      SmallBlindPlayer.Status = 'Fold';
      let nonFoldPlayer = [];
      for (let p of this.Players) if (p.Status != 'Fold') nonFoldPlayer.push(p);
      if (nonFoldPlayer.length == 1) {
        this.RoundOver(nonFoldPlayer, 1);
        return;
      }
    }
    if (SmallBlindPlayer.Status == 'Fold' || SmallBlindPlayer.Status == 'All-In')
      do {
        index = (index + 1) % this.Players.length;
        if (this.Players.find((p) => p.Position == index).Disconnected) {
          this.Log('玩家断线，自动弃牌：' + this.Players.find((p) => p.Position == index).Name);
          this.Players.find((p) => p.Position == index).Status = 'Fold';
          let nonFoldPlayer = [];
          for (let p of this.Players) if (p.Status != 'Fold') nonFoldPlayer.push(p);
          if (nonFoldPlayer.length == 1) {
            this.RoundOver(nonFoldPlayer, 1);
            return;
          }
        }
      }
      while (this.Players.find((p) => p.Position == index).Status == 'Fold' || this.Players.find((p) => p.Position == index).Status == 'All-In');
    this.Players.find((p) => p.Position == index).Status = 'Action';
    this.EvaluateHands();
    this.SetOptions();
    this.Rerender();
  };

  // 分配位置和盲注方法
  this.AssignPosition = () => {
    const positions = Array.from({ length: this.Players.length }, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    this.Players.forEach((player, index) => {
      player.Position = positions[index];
    });
    this.AssignBlind();
  };

  // 分配盲注方法
  this.AssignBlind = () => {
    let SmallBlind = (this.Dealer + 1) % this.Players.length;
    while (this.Players.find((p) => p.Position === SmallBlind).Money == 0) SmallBlind = (SmallBlind + 1) % this.Players.length;
    let BigBlind = (SmallBlind + 1) % this.Players.length;
    while (this.Players.find((p) => p.Position === BigBlind).Money == 0) BigBlind = (BigBlind + 1) % this.Players.length;
    const DealerPlayer = this.Players.find(p => p.Position === this.Dealer);
    if (this.Mode == '2'){
      if (this.RoundNum % this.Players.length == 1 && this.RoundNum != 1) {
        this.BlindSet[0] *= 2;
        this.BlindSet[1] *= 2;
        this.Log('盲注翻倍！当前盲注：' + this.BlindSet[0] + '/' + this.BlindSet[1]);
      }
    }
    const BigBlindPlayer = this.Players.find(p => p.Position === BigBlind);
    const SmallBlindPlayer = this.Players.find(p => p.Position === SmallBlind);    
    this.Log('庄家：' + DealerPlayer.Name + ' 小盲：' + SmallBlindPlayer.Name + ' 大盲：' + BigBlindPlayer.Name);
    DealerPlayer.Blind = 'Dealer';
    SmallBlindPlayer.Blind = 'Small Blind';
    BigBlindPlayer.Blind = 'Big Blind';
    this.TopBet = this.BlindSet[1];
    this.NextBet = 2 * this.BlindSet[1];
    if (BigBlindPlayer.Money <= this.BlindSet[1]) {
      BigBlindPlayer.Bet = BigBlindPlayer.Money;
      BigBlindPlayer.Money = 0;
      BigBlindPlayer.Status = 'All-In';
    }
    else {
      BigBlindPlayer.Money -= this.BlindSet[1];
      BigBlindPlayer.Bet = this.BlindSet[1];
    }
    if (SmallBlindPlayer.Money <= this.BlindSet[0]) {
      SmallBlindPlayer.Bet = SmallBlindPlayer.Money;
      SmallBlindPlayer.Money = 0;
      SmallBlindPlayer.Status = 'All-In';
      // 单挑局小盲All-In特殊处理
      if (this.Dealer == BigBlind) {
        BigBlindPlayer.Status = 'Check';
        this.MovetoNextPlayer();
        return;
      }
    }
    else {
      SmallBlindPlayer.Money -= this.BlindSet[0];
      SmallBlindPlayer.Bet = this.BlindSet[0];
    }  
    let goFirstPosition = (BigBlind + 1) % this.Players.length;
    while (this.Players.find((p) => p.Position == goFirstPosition).Money == 0) goFirstPosition = (goFirstPosition + 1) % this.Players.length;
    if (this.Players.find(p => p.Position === goFirstPosition).Disconnected) {
      this.Log('玩家断线，自动弃牌：' + this.Players.find((p) => p.Position == goFirstPosition).Name);
      this.Players.find((p) => p.Position == goFirstPosition).Status = 'Fold';
      let nonFoldPlayer = [];
      for (let p of this.Players) if (p.Status != 'Fold') nonFoldPlayer.push(p);
      if (nonFoldPlayer.length == 1) {
        this.RoundOver(nonFoldPlayer, 1);
        return;
      }
      this.MovetoNextPlayer();
      return;
    }
    this.Players.find(p => p.Position === goFirstPosition).Status = 'Action';
    this.SetOptions();
  };

  // 设置行动选项方法
  this.SetOptions = () => {
    let actionPlayer = this.Players.find(p => p.Status === 'Action');
    let possibleActions = {
      Fold: 'yes',
      Check: 'yes',
      Call: 'yes',
      Bet: 'yes',
      Raise: 'yes'
    };
    if (this.TopBet != 0) {
      possibleActions.Check = 'no';
      possibleActions.Bet = 'no';
      if (actionPlayer.Blind == 'Big Blind' && actionPlayer.Status == 'Action' && this.TopBet == this.BlindSet[1] && this.StageNum == 1) {
        possibleActions.Fold  = 'no';
        possibleActions.Check = 'yes';
        possibleActions.Call = 'no';
      }
    }
    else {
      possibleActions.Fold = 'no';
      possibleActions.Raise = 'no';
      possibleActions.Call = 'no';
    } 
    if (actionPlayer.Money < this.BlindSet[1]) possibleActions.Bet = 'no';
    if (this.NextBet > actionPlayer.Money + actionPlayer.Bet) possibleActions.Raise = 'no';
    if (this.TopBet >= actionPlayer.Money + actionPlayer.Bet) actionPlayer.Options = ['Fold','All-In'];
    else actionPlayer.Options = Object.keys(possibleActions).filter(action => possibleActions[action] === 'yes');
  };

  // 评估玩家手牌方法
  this.EvaluateHands = () => {
    // 辅助函数：生成从数组中选择 k 个索引的组合
    const Combinations = (arr, k) => {
      const res = [];
      const n = arr.length;
      const comb = (start, chosen) => {
        if (chosen.length === k) { res.push(chosen.slice()); return; }
        for (let i = start; i < n; i++) { chosen.push(arr[i]); comb(i+1, chosen); chosen.pop(); }
      };
      comb(0, []);
      return res;
    };

    // 辅助函数：把 5 张牌的组合评估为{rank,{val_1,...}}对象
    const EvalFive = (cards) => {
      const vals = cards.map(c => c.Value).sort((a,b)=>b-a);
      const suits = cards.map(c => c.Suit);
      const countMap = new Map();
      for (const v of vals) countMap.set(v, (countMap.get(v) || 0) + 1);
      const counts = Array.from(countMap.entries()).sort((a,b)=>{
        if (b[1] !== a[1]) return b[1]-a[1];
        return b[0]-a[0];
      });
      const suitCount = {};
      for (const s of suits) suitCount[s] = (suitCount[s] || 0) + 1;
      const isFlush = Object.keys(suitCount).find(s => suitCount[s] == 5);
      const valSet = new Set(vals);
      let straightHigh = -1;
      for (let h = 12; h >= 4; h--) {
        let ok = true;
        for (let k = 0; k < 5; k++) if (!valSet.has(h-k)) { ok = false; break; }
        if (ok) { straightHigh = h; break; }
      }
      if (straightHigh === -1 && valSet.has(12) && valSet.has(0) && valSet.has(1) && valSet.has(2) && valSet.has(3)) straightHigh = 3;
      const isStraight = straightHigh !== -1;
      const mostCount = counts[0][1];
      const tiebreakers = [];
      if (isFlush && isStraight) {
        tiebreakers.push(straightHigh);
        if (straightHigh === 12) return { rank: 10, tiebreakers };
        else return { rank: 9, tiebreakers };
      }
      if (mostCount === 4) {
        tiebreakers.push(counts[0][0]);
        for (const [val, cnt] of counts) if (cnt !== 4) tiebreakers.push(val);
        return { rank: 8, tiebreakers };
      }
      if (mostCount === 3 && counts[1][1] ==2) {
        tiebreakers.push(counts[0][0]);
        tiebreakers.push(counts[1][0]);
        return { rank: 7, tiebreakers };
      }
      if (isFlush) {
        for (const v of vals) tiebreakers.push(v);
        return { rank: 6, tiebreakers };
      }
      if (isStraight) {
        tiebreakers.push(straightHigh);
        return { rank: 5, tiebreakers };
      }
      if (mostCount === 3) {
        tiebreakers.push(counts[0][0]);
        for (const [val, cnt] of counts) if (cnt !== 3) tiebreakers.push(val);
        return { rank: 4, tiebreakers };
      }
      if (mostCount === 2 && counts[1][1] === 2) {
        tiebreakers.push(counts[0][0]);
        tiebreakers.push(counts[1][0]);
        for (const [val, cnt] of counts) if (cnt !== 2) tiebreakers.push(val);
        return { rank: 3, tiebreakers };
      }
      if (mostCount === 2) {
        tiebreakers.push(counts[0][0]);
        for (const [val, cnt] of counts) if (cnt !== 2) tiebreakers.push(val);
        return { rank: 2, tiebreakers };
      }
      for (const v of vals) tiebreakers.push(v);
      return { rank: 1, tiebreakers };
    };

    this.Players.forEach((player) => {
      const commCombos = Combinations(this.Community.concat(player.Cards), 5);
      let best = { rank: 0, score: 0 };
      let bestCombo = null;
      for (const comb of commCombos) {
        const ev = EvalFive(comb);
        let score = 0;
        if(ev.rank == 1) score = 16741 * ev.tiebreakers[0] + 1691 * ev.tiebreakers[1] + 155 * ev.tiebreakers[2] + 13 * ev.tiebreakers[3] + ev.tiebreakers[4] - 72359;
        else if(ev.rank == 2) score = 1691 * ev.tiebreakers[0] + 155 * ev.tiebreakers[1] + 13 * ev.tiebreakers[2] + ev.tiebreakers[3] + 148318;
        else if(ev.rank == 3) score = 167 * ev.tiebreakers[0] + 13 * ev.tiebreakers[1] + ev.tiebreakers[2] + 170286;
        else if(ev.rank == 4) score = 155 * ev.tiebreakers[0] + 13 * ev.tiebreakers[1] + ev.tiebreakers[2] + 172417;
        else if(ev.rank == 5) score = ev.tiebreakers[0] + 174428;
        else if(ev.rank == 6) score = 16741 * ev.tiebreakers[0] + 1691 * ev.tiebreakers[1] + 155 * ev.tiebreakers[2] + 13 * ev.tiebreakers[3] + ev.tiebreakers[4] + 102081;
        else if(ev.rank == 7) score = 13 * ev.tiebreakers[0] + ev.tiebreakers[1] + 323249;
        else if(ev.rank == 8) score = 13 * ev.tiebreakers[0] + ev.tiebreakers[1] + 323416;
        else if(ev.rank == 9 || ev.rank == 10) score = ev.tiebreakers[0] + 323581;
        if (score > best.score) { best = { rank: ev.rank, score: score }; bestCombo = comb.slice(); }
      }
      player.Hand = { rank: best.rank, score: best.score, bestCommunity: bestCombo};
    });
  };
};
module.exports = Game;