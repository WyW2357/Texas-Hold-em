// 页面初始化设置
$(function () {
  $('.modal').modal();
  $('#mainPage').hide();
  $('#gameDiv').hide();
  $('#loginModal').modal('open');
  $('#gameEndModal').modal('close');
});

// 连接到服务器的Socket.IO
var socket = io();

// 处理登录请求，点击 登录 按钮触发
var Login = function () {
  socket.emit('login', { Username: $('#loginName').val(), Password: $('#loginPassword').val() });
};

// 处理创建房间的请求，点击 创建房间 按钮触发
var BeginHost = function () {
  socket.emit('host', { Username: $('#hostName').val(), Mode: $('#hostMode').val(), ID: $('#loginName').val() });
};

// 处理加入房间的请求，点击 加入房间 按钮触发
var JoinRoom = function () {
  socket.emit('join', { Code: $('#code').val(), Username: $('#joinName').val(), ID: $('#loginName').val() });
};

// 处理开始游戏的请求，点击 开始游戏 按钮触发
var StartGame = function (code) {
  socket.emit('start', { Code: code });
};

// 弃牌
var Fold = function () {
  $('#gameDiv').find('.action-buttons').remove();
  socket.emit('action', { Action: 'Fold' });
};

// 下注
var Bet = function () {
  var amt = parseInt($('#actionRangeSlider').val(), 10);
  socket.emit('action', { Action: 'Bet', Amount: amt });
};

// 跟注
var Call = function() {
  $('#gameDiv').find('.action-buttons').remove();
  socket.emit('action', { Action: 'Call' });
}

// 过牌
var Check = function () {
  $('#gameDiv').find('.action-buttons').remove();
  socket.emit('action', { Action: 'Check' });
};

// 加注
var Raise = function () {
  var amt = parseInt($('#actionRangeSlider').val(), 10);
  socket.emit('action', { Action: 'Raise', Amount: amt });
};

// 全下
var AllIn = function () {
  $('#gameDiv').find('.action-buttons').remove();
  socket.emit('action', { Action: 'All-In' });
};

// 秀牌
var Show = function () {
  $('#gameDiv').find('.action-buttons').remove();
  socket.emit('action', { Action: 'Show' });
};

// 处理登录的响应
socket.on('loginResponse', function (data) {
  if (data.Error == 1) M.toast({html: '用户名不存在!', displayLength: 4000});
  else if (data.Error == 2) M.toast({html: '密码错误!', displayLength: 4000});
  else {
    $('#loginModal').modal('close');
    var cardContent = '<p>用户名：' + data.UserData.Username + '</p><p>个人筹码：' + data.UserData.Money + '</p><p>比赛积分：' + data.UserData.pt + 'pt</p>';
    $('.playerdata').html(cardContent);
    $('#mainPage').show();
    localStorage.setItem('username', $('#loginName').val());
    localStorage.setItem('password', $('#loginPassword').val());
    M.toast({html: '登录成功！欢迎 ' + data.UserData.Username + ' ！', displayLength: 4000});
  }
});

// 处理创建房间的响应，显示房间信息和玩家列表
socket.on('hostRoom', function (data) {
  if (data.Error == 1) {
    $('#hostModal').modal('close');
    M.toast({html: '用户名不能为空!', displayLength: 4000});
  }
  else if (data.Error == 2) {
    $('#hostModal').modal('close');
    M.toast({html: '用户名长度不能超过10个字符!', displayLength: 4000});
  }
  else {
    var roommode = '';
    if (data.Mode == '1') roommode = '自由模式';
    else if (data.Mode == '2') roommode = '锦标赛模式';
    var hostHtml = '<div class="room-info"><span class="room-code">房间号：<code>' + data.Code + '</code></span>' +
    '<span class="room-count">房间人数：' + data.Players.length + '</span>' + '<span class="room-mode">' + roommode + '</span></div>';
    $('.modal-content').html(hostHtml);
    $('.playersNames').html(data.Players.map(function (p) { return '<span>' + p + (p == data.Host ? '(房主)' : '') + '</span><br />'; }).join(''));
    if (data.Players.length >= 2)
      $('.gamebutton').html('<br /><button onclick=StartGame('+ data.Code +') type="submit" class= "game-btn modal-trigger" style="margin-left:25px;">开始 游戏</button >');
    if (data.HostChange) {
      $('#joinModal').modal('close');
      $('#hostModal').modal('open');
    }
  }
});

// 处理加入房间的响应，显示等待界面
socket.on('joinRoom', function (data) {
  if (data.Error == 1) {
    $('#joinModal').modal('close');
    M.toast({html: '用户名不能为空!', displayLength: 4000});
  }
  else if (data.Error == 2) {
    $('#joinModal').modal('close');
    M.toast({html: '用户名长度不能超过10个字符!', displayLength: 4000});
  }
  else if (data.Error == 3) {
    $('#joinModal').modal('close');
    M.toast({html: "该房间不存在!", displayLength: 4000});
  }
  else if (data.Error == 4) {
    $('#joinModal').modal('close');
    M.toast({html: "游戏已在进行中!", displayLength: 4000});
  }
  else if (data.Error == 5) {
    $('#joinModal').modal('close');
    M.toast({html: "此ID已经被使用!", displayLength: 4000});
  }
  else {
    var roommode = '';
    if (data.Mode == '1') roommode = '自由模式';
    else if (data.Mode == '2') roommode = '锦标赛模式';
    var joinHtml = '<div class="room-info"><span class="room-code">房间号：<code>' + data.Code + '</code></span>' +
    '<span class="room-count">房间人数：' + data.Players.length + '</span>' + '<span class="room-mode">' + roommode + '</span></div>';
    $('.modal-content').html(joinHtml);
    $('.playersNames').html(data.Players.map(function (p) { return '<span>' + p + (p == data.Host ? '(房主)' : '') + '</span><br />'; }).join(''));
  }
});

// 处理开始游戏的响应
socket.on('gameStart', function () {
  $('#mainPage').hide();
  $('.modal').modal('close');
  $('#gameDiv').show();
});

// 处理游戏结束的响应
socket.on('gameEnd', function (data) {
  if (data.Type == 2) {
    var resultHtml = '<h4>最终排名：</h4><br />';
    data.Players.sort((a, b) => a.Grade[0] - b.Grade[0]);
    data.Players.forEach(function (p) {
      resultHtml += '<p>第' + p.Grade[0] + '名：' + p.Name + ' +' + p.Grade[1] + 'pt</p>';
    });
    $('.playersGrades').html(resultHtml);
    $('#gameEndModal').modal('open');
  }
  setTimeout(() => {
    $('#gameDiv').hide();
    socket.emit('login', { Username: localStorage.getItem('username'), Password: localStorage.getItem('password') })
    if (data.Type == 2) $('#gameEndModal').modal('close');
  }, 5000);
});

// 处理玩家加入通知
socket.on('playerJoined', function () {
  $('#mainPage').hide();
  $('.modal').modal('close');
  $('#gameDiv').show();
});

// 处理等待加入房间的响应
socket.on('waitingtojoinRoom', function () {
    var joinHtml = '<div class="room-info">等待加入中......</div>';
    $('.modal-content').html(joinHtml);
    $('.playersNames').empty();
});

// 处理玩家断线通知
socket.on('playerDisconnected', function (names) {
  names.forEach(function (name) {
    $('#gameDiv').find('.player-bet[data-name="' + name + '"]').remove();
    $('#gameDiv').find('.player-blind-badge[data-name="' + name + '"]').remove();
  });
});

// 接收游戏状态更新并重新渲染游戏界面
socket.on('rerender', function (data) {
  var players = data.Players;
  var nPlayers = players.length;
  var $gameDiv = $('#gameDiv');

  // 桌面布局
  $gameDiv.find('.game-table').remove();
  var $table = $('<div class="game-table"></div>');
  var $felt = $('<div class="felt"></div>');
  var $board = $('<div class="board"></div>');
  for (var i = 0; i < 5; i++) $board.append('<div class="board-slot" data-pos="' + i + '"></div>');
  if (data.Community.length > 0)
    $board.find('.board-slot').each(function (i, el) {
      $(el).empty();
      if (data.Community[i]) $(el).append($('<img/>').attr('src', data.Community[i].ImgPath).addClass('board-card'));
    });
  $felt.append($board);
  $table.append($felt);
  $gameDiv.append($table);

  var gameDivOffset = $gameDiv.offset();
  var tableOffset = $table.offset();
  var tableWidth = $table.outerWidth();
  var tableHeight = $table.outerHeight();
  var centerX = (tableOffset.left - gameDivOffset.left) + tableWidth / 2;
  var centerY = (tableOffset.top - gameDivOffset.top) + tableHeight / 2;
  
  // 更新桌面信息
  $gameDiv.find('.table-info').remove();
  var betsText = data.BlindSet[0];
  for (var i = 1; i < data.BlindSet.length; i++) betsText += ' / ' + data.BlindSet[i];
  var $topInfo = $('<div class="top-table-info table-info"></div>');
  var modename = '';
  if (data.Mode == '1') modename = '自由模式';
  else if (data.Mode == '2') modename = '锦标赛模式';
  var modeHtml = '<span class="table-modename">' + modename + '</span>';
  var stageHtml = '';
  switch(data.StageNum) {
    case 1: stageHtml = '<span class="table-stage">翻牌前</span>'; break;
    case 2: stageHtml = '<span class="table-stage">翻牌圈</span>'; break;
    case 3: stageHtml = '<span class="table-stage">转牌圈</span>'; break;
    case 4: stageHtml = '<span class="table-stage">河牌圈</span>'; break;
    case 5: stageHtml = '<span class="table-stage">摊牌</span>'; break;
  }
  var topHtml = modeHtml + '底池：<span class="table-info-pool">' + data.BetsPool + '</span> <img src="./img/table/chip.png" class="table-info-chip"/>' + stageHtml;
  $topInfo.html('<div class="table-info-line2">' + topHtml + '</div>');
  var $bottomInfo = $('<div class="bottom-table-info table-info"></div>');
  var bottomHtml = '<span class="table-info-round">第' + data.RoundNum + '局</span>' + ' <span class="table-info-blind">' + betsText + '</span> <img src="./img/table/chip.png" class="table-info-chip"/>';
  $bottomInfo.html('<div class="table-info-line1">' + bottomHtml + '</div>');
  $gameDiv.append($topInfo);
  $gameDiv.append($bottomInfo);
  var topY = centerY - tableHeight / 8 + (data.Community.length > 0 ? 0 : 60);
  var bottomY = centerY + tableHeight / 8 - (data.Community.length > 0 ? 0 : 60);
  $topInfo.css({ left: centerX + 'px', top: topY + 'px', transform: 'translate(-50%, -50%)' });
  $bottomInfo.css({ left: centerX + 'px', top: bottomY + 'px', transform: 'translate(-50%, -50%)' });

  // 更新玩家信息
  $gameDiv.find('.player-box').remove();
  players.forEach(function (p) {
    var $box = $('<div class="player-box"></div>');
    if (p.Status === 'Action') $box.addClass('player-action');
    if (p.Status === 'Fold') $box.addClass('player-folded');
    if (p.Status === 'All-In') $box.addClass('player-allin');
    $box.attr('data-position', p.Position);
    $box.attr('data-name', p.Name);

    var $row1 = $('<div class="player-row player-row-top"></div>');
    var $name = $('<div class="player-name"></div>').text(p.Name);
    if (data.Mode == '1' && p.BuyIn !== 0) {
      var buyIntext = '';
      if (p.BuyIn > 0) buyIntext = '(买入' + p.BuyIn + '次)';
      if (p.BuyIn < 0) buyIntext = '(卖出' + (-p.BuyIn) + '次)';
      var $buyIn = $('<span class="buyin-amt"></span>').text(buyIntext);
      $name.append($buyIn);
    }
    if (p.Disconnected) {
      var $disc = $('<span class="disconnected-badge">(掉线)</span>');
      $name.append($disc);
    }
    $row1.append($name);

    var $row2 = $('<div class="player-row player-row-middle"></div>');
    if (p.Grade && p.Grade[2]) {
      var $outBadge = $('<div class="player-out-badge"></div>').text('第' + p.Grade[0] + '名 ' + p.Grade[1] + 'pt');
      $row2.append($outBadge);
    }
    else {
      var $money = $('<div class="player-money"></div>');
      var $chipIcon = $('<img class="money-icon" src="./img/table/chip.png">');
      var $amt = $('<span class="money-amt"></span>').text(p.Money);
      $money.append($chipIcon).append($amt);
      $row2.append($money);
      if ((p.Name === data.MyName && data.MyHand) || p.Hand) {
        var handDesc = '';
        var handValue = p.Name === data.MyName ? data.MyHand : p.Hand;
        switch(handValue) {
          case 1: handDesc = '高牌'; break;
          case 2: handDesc = '一对'; break;
          case 3: handDesc = '两对'; break;
          case 4: handDesc = '三条'; break;
          case 5: handDesc = '顺子'; break;
          case 6: handDesc = '同花'; break;
          case 7: handDesc = '葫芦'; break;
          case 8: handDesc = '四条'; break;
          case 9: handDesc = '同花顺'; break;
          case 10: handDesc = '皇家同花顺'; break;
        }
        var $handInfo = $('<div class="player-hand-info"></div>').text(handDesc);
        $row2.append($handInfo);
      }
    }

    var $row3 = $('<div class="player-row player-row-bottom"></div>');
    var $hand = $('<div class="player-hand"></div>');
    if (p.Name === data.MyName)
      data.MyCards.forEach(function (card) {
        $hand.append($('<img/>').attr('src', card.ImgPath).addClass('card-img'));
      });
    else if (p.Cards.length > 0)
      p.Cards.forEach(function (card) {
        $hand.append($('<img/>').attr('src', card.ImgPath).addClass('card-img'));
      });
    else
      for (var i = 0; i < 2; i++)
        $hand.append($('<img/>').attr('src', './img/cards/back.png').addClass('card-img'));
    $row3.append($hand);
    $box.append($row1, $row2, $row3);

    var relativeIndex  = ((p.Position - players.find(function(p) { return p.Name === data.MyName; }).Position) % nPlayers + nPlayers) % nPlayers;
    var angle = (relativeIndex / nPlayers) * Math.PI * 2 + Math.PI / 2 ;
    var x = centerX + tableWidth / 2 * Math.cos(angle);
    var y = centerY + tableHeight / 2 * Math.sin(angle);
    $gameDiv.append($box);
    $box.css({ left: x + 'px', top: y + 'px', transform: 'translate(-50%, -50%)' });

    // 显示玩家下注
    $gameDiv.find('.player-bet[data-name="' + p.Name + '"]').remove();
    if (p.Bet !== 0) {
      var betX = x + (centerX - x) * 0.35;
      var betY = y + (centerY - y) * 0.35;
      var $bet = $('<div class="player-bet" data-name="' + p.Name + '"></div>');
      var $chip = $('<img class="chip-img" src="./img/table/chip.png">');
      var $amt = $('<div class="bet-amount"></div>').text((p.Bet > 0 && players.some((p) => p.Bet < 0) ? '+' : '') + p.Bet);
      $bet.append($chip).append($amt);
      $gameDiv.append($bet);
      $bet.css({ left: betX + 'px', top: betY + 'px', transform: 'translate(-50%, -50%)' });
    }

    // 显示玩家盲注或庄家标志
    $gameDiv.find('.player-blind-badge[data-name="' + p.Name + '"]').remove();
    if (p.Blind !== '') {
      var imgFile = '';
      if (p.Blind === 'Big Blind') imgFile = './img/table/Big Blind.png';
      else if (p.Blind === 'Small Blind') imgFile = './img/table/Small Blind.png';
      else if (p.Blind === 'Dealer' && nPlayers > 2) imgFile = './img/table/Dealer.png';
      if (imgFile) {
        var blindX = x + (centerX - x) * 0.25;
        var blindY = y + (centerY - y) * 0.25;
        var $badge = $('<div class="player-blind-badge" data-name="' + p.Name + '"></div>');
        var $img = $('<img class="blind-img" alt="blind">').attr('src', imgFile);
        $badge.append($img);
        $gameDiv.append($badge);
        $badge.css({ left: blindX + 'px', top: blindY + 'px', transform: 'translate(-50%, -50%)' });
      }
    }

    // 显示选项按钮
    if (p.Name === data.MyName) {
      $gameDiv.find('.action-buttons').remove();
      if (data.MyOptions.length > 0) {
        var $actionDiv = $('<div class="action-buttons"></div>');
        data.MyOptions.forEach(function (option) {
          var $btn = null;
          if (option == 'Fold') {
            $btn = $('<button type="button" class="action-btn fold-btn">弃牌</button>');
            $btn.on('click', Fold);
          }
          else if (option == 'Check') {
            $btn = $('<button type="button" class="action-btn check-btn">过牌</button>');
            $btn.on('click', Check);
          }
          else if (option == 'Call') {
            $btn = $('<button type="button" class="action-btn call-btn">跟注' + (data.TopBet - p.Bet) + '</button>');
            $btn.on('click', Call);
          }
          else if (option == 'Bet') {
            $btn = $('<button type="button" class="action-btn bet-btn">下注</button>');
            $btn.on('click', Bet);
          }
          else if (option == 'Raise') {
            $btn = $('<button type="button" class="action-btn raise-btn">加注到</button>');
            $btn.on('click', Raise);
          }
          else if (option == 'All-In') {
            $btn = $('<button type="button" class="action-btn allin-btn">ALL-IN</button>');
            $btn.on('click', AllIn);
          }
          else if(option == 'Show') {
            $btn = $('<button type="button" class="action-btn show-btn">秀牌</button>');
            $btn.on('click', Show);
          }
          if ($btn) $actionDiv.append($btn);
        });
        $gameDiv.append($actionDiv);
        $actionDiv.css({ left: centerX + 'px', top: (centerY + 150) + 'px', transform: 'translate(-50%, -50%)' });
      }
    }

    // 显示下注/加注滑块
    if (p.Name === data.MyName) {
      $gameDiv.find('.action-slider').remove();
      if (data.MyOptions.length > 0 && (data.MyOptions.includes('Bet') || data.MyOptions.includes('Raise'))) {
        var minAmt = data.MyOptions.includes('Bet') ? data.BlindSet[1] : data.NextBet;
        var maxAmt = data.MyOptions.includes('Bet') ? p.Money : (p.Money + p.Bet);
        var $sliderWrap = $('<div class="action-slider"></div>');
        var $range = $('<input id="actionRangeSlider" type="range">').attr({
          min: minAmt,
          max: maxAmt,
          value: Math.min(maxAmt, Math.max(minAmt, minAmt))
        });
        var $val = $('<span id="actionRangeValue" class="slider-value"></span>').text($range.val());
        $sliderWrap.append($range).append($val);
        $gameDiv.append($sliderWrap);
        $sliderWrap.css({ left: centerX + 'px', top: (centerY + 200) + 'px', transform: 'translate(-50%, -50%)' });
        $range.on('input change', function () {
          $('#actionRangeValue').text(this.value);
        });
      }
    }
  });
});