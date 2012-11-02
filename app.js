/*global xui:true, Marbles:true */

// (function () {
var $ = window.xui,
    bonusTimer,
    levelUpTimer = null,
    $potential = $('#potential'),
    gameActive = false,
    colours = ['empty', 'one', 'two', 'three', 'four'],
    $grid = $('#grid'),
    n = 7,
    // dimension information - 7x7 grid, 3 types
    nativeapp = (window.innerHeight === 460 && !navigator.standalone) ? 1 : false, // this sucks, but it's the only way to work it out
    comp = window.getComputedStyle(document.body,null),
    bodyDims = { height: parseInt(comp['height'], 10) - (nativeapp ? 20 : 0), width: parseInt(comp['width'], 10) },
    whichBaseLine = bodyDims.width > bodyDims.height ? 'height' : 'width',
    controlHeight = bodyDims.height - bodyDims.width < 90 ? 90 : 0, // 90 = 44 * 2 + 2px border
    baseWidth = (bodyDims.width > bodyDims.height ? bodyDims.height : bodyDims.width) - controlHeight,
    // baseWidth = 320,
    dim = { grid: [n,n], types: 3, marble: [~~(baseWidth/n),~~(baseWidth/n)] },
    $score = $('#score'),
    $retryboard = $('#retryboard'),
    $replay = $('#replay'),
    $marbles,
    highscoreTable = $('#highscoreTable')[0],
    $highscoresWrapper = $('#highscores'),
    highscores = JSON.parse(localStorage.getItem('highscores') || '[]') || [],
    playedBefore = localStorage ? localStorage.getItem('playedBefore') : null,
    lose = [
      'You lose.',
      'Try harder.',
      'Game. Over.',
      'You lost. Again.',
      'Try again?',
      'More effort required',
      'Are you even trying?',
      'Shall we start again?'
    ],
    $body = $(document.body),
    $tweet = $('#tweet');

var time = (function () {
  var monthDict = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    time: function (date) {
      var hour = date.getHours(),
          min = date.getMinutes() + "",
          ampm = 'am';
  
      if (hour === 0) {
        hour = 12;
      } else if (hour === 12) {
        ampm = 'pm';
      } else if (hour > 12) {
        hour -= 12;
        ampm = 'pm';
      }
  
      if (min.length === 1) {
        min = '0' + min;
      }
  
      return hour + ampm;
    },
    date: function (date) {
      var ds = date.toDateString().split(/ /),
          mon = monthDict[date.getMonth()],
          day = date.getDate()+'',
          dayi = ~~(day),
          year = date.getFullYear(),
          thisyear = (new Date()).getFullYear(),
          th = 'th';

      // anti-'th' - but don't do the 11th, 12th or 13th
      if ((dayi % 10) === 1 && dayi !== 11) {
        th = 'st';
      } else if ((dayi % 10) === 2 && day.substr(0, 1) !== '1') {
        th = 'nd';
      } else if ((dayi % 10) === 3 && day.substr(0, 1) !== '1') {
        th = 'rd';
      }

      if (day.substr(0, 1) === '0') {
        day = day.substr(1);
      }

      return mon + ' ' + day + th + (thisyear !== year ? ', ' + year : '');
    },
    datetime: function (t) {
      var date = new Date(t);

      return this.time(date) + ' ' + this.date(date);
    },
    relative: function (t) {
      var date = new Date(t),
          relative_to = (arguments.length > 1) ? arguments[1] : new Date(),
          delta = ~~((relative_to.getTime() - t) / 1000),
          r = '';

      // delta = delta + (relative_to.getTimezoneOffset() * 60);

      if (delta < 60) {
        r = 'just now';
      } else if (delta < 120) {
        r = 'a minute ago';
      } else if (delta < (45*60)) {
        r = (~~(delta / 60)).toString() + ' mins ago';
      } else if (delta < (2*90*60)) { // 2* because sometimes read 1 hours ago
        r = (~~(delta / 60)).toString() + ' mins ago';
        // r = '1 hour ago';
      } else if (delta < (24*60*60)) {
        r = (~~(delta / 3600)).toString() + ' hours ago';
      } else {
        if (delta < (48*60*60)) {
          r = this.time(date) + ' yesterday';
        } else {
          r = this.date(date); //  this.time(date) + ' ' +
        }
      }

      return r;
    }
  };
})();

function prevent(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }

  if (event && event.stopPropagation) {
    event.stopPropagation();
  }
}

function serverLog(message) {
  var client = new XMLHttpRequest();
  client.open("POST", "http://marbles2.com/log.php");
  client.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  client.send('data='+encodeURIComponent(message));
}

function commafy(n) {
  return n.toString().replace(/(^|[^\w.])(\d{4,})/g, function($0,$1,$2) {
    return $1 + $2.replace(/\d(?=(?:\d\d\d)+(?!\d))/g, "$&,");
  });
}

function newTimer(width) {
  var countdown = $('#timer')[0], newCountdown = document.createElement('div');
  newCountdown.setAttribute('id', 'timer');
  if (width) {
    newCountdown.style.width = width;
  }
  newCountdown.className = 'toolbar';
  
  document.body.appendChild(newCountdown);
  countdown.parentNode.removeChild(countdown);
}

function selectMarble(event) {
  prevent(event);
  
  if (!gameActive) {
    return;
  }

  var t = this, //event.target,
      m = Marbles.get(t.x, t.y);

  if (m) {
    m.tag();
    if (Marbles.activeTags) {
      Marbles.clear();
    }
  }

  $score.html('Score: ' + commafy(Marbles.getScore()));
}

function startTimer() {
  // reset
  newTimer();
  $('#timer').tween({ width : 0 + 'px' }, { duration: 10 * 1000, easing: 'linear', callback: function () {
    Marbles.bonusFinished();
  }});
}

function stopTimer() {
  newTimer(getComputedStyle(document.getElementById('timer'), null).width);
}

function initDraw(noTimer) {
  clearInterval(levelUpTimer); // just in case
  $body.removeClass('levelup');
  var countdown = $('#newGameCountdown')[0];
  countdown.innerHTML = '3';
  $potential.html('Level: ' + Marbles.level);
  Marbles.init(dim.grid[0], dim.grid[1], dim.types);
  
  // var divs = $grid[0].getElementsByTagName('div');
  // [].forEach.call(divs, function (div) {
  //   div.parentNode.removeChild(div);
  // });
  $grid.find('div').each(function () {
    this.parentNode.removeChild(this);
  });
  
  $body.removeClass('gameover');
  
  // rebuild
  var h = parseInt(Marbles.height * dim.marble[1], 10), w = parseInt(Marbles.width * dim.marble[0], 10);
  $grid.css({ 'width': w, 'height': h });
  $('#grid').css('width', w);
  Marbles.loop(function (x,y) {
    var m = Marbles.get(x,y);
    var d = document.createElement('div');
    d.x = x;
    d.y = y;
    d.className = colours[m.type]; // should never be tagged during this point
    $grid[0].appendChild(d);
    $(d).css({
      'background': colours[m.tagged] || 'empty',
      'left': parseInt(x * dim.marble[0], 10) + 'px',
      'top': parseInt(h - dim.marble[1] - (y * dim.marble[1]), 10) + 'px'
    });
  });
  $marbles = $grid.find('div'); //$($grid[0].getElementsByTagName('div'));
  $marbles.touchClick(selectMarble);

  // var down = null;
  // $marbles.on('touchstart', function () {
  //   var m = Marbles.get(this.x, this.y);
  //   m.tag();
  //   // console.log('tagging', { x: this.x, y: this.y, gameActive: gameActive });
  // }).on('touchmove', function () {
  //   if (!Marbles.get(this.x, this.y).tagged) {
  //     Marbles.untag();
  //   }
  // }).on('touchend', function () {
  //   down = null;
  //   Marbles.clear();
  // });

  //$marbles.touch(selectMarble);
  //$marbles.on('touchin', function () {
  //  Marbles.get(this.x, this.y).tag();
  //}).on('touchout', function () {
  //  Marbles.untag();
  //});
  gameActive = true;
  $score.html('Score: ' + commafy(Marbles.getScore()));
  
  if (noTimer !== true) {
    startTimer();
  }
  
  return false;
}

// play again
function newGame(event) {
  prevent(event);
  Marbles.seed(true);
  Marbles.newGame();
  return initDraw();
}

function retryboard(e) {
  prevent(event);
  Marbles.seed(Marbles.seed());
  Marbles.newGame();
  return initDraw();
}

function levelUpNewGame(event) {
  Marbles.levelUp();
  prevent(event);
  clearInterval(levelUpTimer);
  $body.removeClass('levelup');
  $('#newGameCountdown')[0].innerHTML = '3';
  initDraw();
}

function removeSave(event) {
  document.body.className = '';
  startTimer();
  if (event && event.preventDefault) {
    event.preventDefault();
  }
}

function saveHighscore() {
  var score = Marbles.getScore(), newHighscore = highscores.length === 0;
  highscores.push({ score: score, date: +new Date(), level: Marbles.level, seed: Marbles.seed() });
  highscores = highscores.sort(function (a, b) {
    return b.score > a.score ? 1 : -1;
  }).slice(0, 9); // limit to 10;
  
  try {
    // annoying that Safari occassionally breaks here for no reason
    localStorage.setItem('highscores', JSON.stringify(highscores));
  } catch (e) {}
  
  if (newHighscore || highscores[highscores.length-1].score < score) {
    // genius: http://twitter.com/slevithan/status/11418431475
    if (highscores[0].score <= score) {
      $('#hsn')[0].innerHTML = commafy(score);
    }
    
    var msg = "I scored " + commafy(score) + " playing this Marbles² board: http://marbles2.com/app/?seed=" + Marbles.seed();
    $tweet[0].href = 'http://twitter.com/?status=' + encodeURIComponent(msg);
    $replay.addClass('highscore');
    serverLog(JSON.stringify(Marbles.history));
    return 'High score: ' + commafy(score) + '!';
  } else {
    $replay.removeClass('highscore');
    return lose[~~(Math.random()*lose.length)];
  }
}

function showHighscores(event) {
  prevent(event);
  var el = highscoreTable;
  if (highscores.length) {
    el.innerHTML = '';
  }
  highscores.forEach(function (score, i) {
    el.innerHTML += '<tr><td>' + commafy(score.score) + '</td><td>' + time.relative(score.date) +'</td><td>' + (score.seed ? '<div class="playagain button" data-seed="' + score.seed + '" title="' + score.seed + '">Play</div>' : '&nbsp;') + '</td></tr>';
  });
  
  $highscoresWrapper.find('div.button').touch(function () {
    var seed = this.getAttribute('data-seed');
    if (seed) {
      $body.removeClass('highscores');
      Marbles.newGame();
      Marbles.seed(seed);
      initDraw();
    }
  });
  $body.addClass('highscores');
}

function getIFrame() {
  var iframe = document.createElement('iframe');
  iframe.style.visibility = 'none';
  iframe.style.position = 'absolute';
  iframe.style.left = '-999px';
  iframe.style.height = '1px';
  iframe.style.width = '1px';
  return iframe;
}

function openURL(url, def) {
  var iframe = getIFrame();
  document.body.appendChild(iframe);

  if (!nativeapp) {
    window.location = def;
    return;
  }
  
  var sandbox = iframe.contentWindow;
  try {
    iframe.contentWindow.location = url;
  } catch (e) {
    window.alert('err');
    window.location = def;
  }
}

// broken in PhoneGap 0.8.3
// var wide = document.createElement('meta');
// wide.setAttribute('id','meta');
// wide.setAttribute('name', 'viewport');
// wide.setAttribute('content', 'width=720; user-scalable=no');
//
// var narrow = document.createElement('meta');
// narrow.setAttribute('id','meta');
// narrow.setAttribute('name', 'viewport');
// narrow.setAttribute('content', 'width=320; user-scalable=no');


var s = document.createElement('style');
document.body.appendChild(s);
s.innerText = '#grid > div { height: ' + (~~(baseWidth/7)-5) + 'px; width: ' + (~~(baseWidth/7)-5) + 'px; } #grid { height: ' + baseWidth + 'px; left: ' + Math.ceil((bodyDims.width - (~~(baseWidth/n))*7)/2) + 'px; ; } html,body { height: ' + bodyDims.height + 'px;}';
try {
  s.innerHTML = s.innerText;
} catch (e) {} // fails only on the WebkitMobile **hardware** environment

Marbles.drawMarble = function (x, y, tagged, type) {
  var i = x + (Marbles.width * y);
  $marbles[x + (Marbles.width * y)].className = colours[type] || 'empty';
  if (tagged) {
    $marbles[i].className += ' active';
  }
};

Marbles.gameover(function () {
  var movesLeft = this.movesLeft(), msg = '';
  
  stopTimer();
  
  if (movesLeft === 0 && this.marblesLeft() !== 0) {
    gameActive = false;
    msg = saveHighscore();
    $('#msg').html(msg);
    $body.addClass('gameover');
  } else if (movesLeft === 0 && this.marblesLeft() === 0) {
    // next level
    $body.addClass('levelup');
    levelUpTimer = setInterval(function () {
      var countdown = $('#newGameCountdown')[0];
      if (countdown.innerHTML === 1) {
        clearInterval(levelUpTimer);
        levelUpNewGame();
      } else {
        countdown.innerHTML = countdown.innerHTML - 1;
      }
    }, 1000);
  }
});



$(document).on('orientationchange', function(e) {
  // alert("Orientation changed to " + window.orientation);
  // var meta = document.getElementById('meta');
  // meta.parentNode.removeChild(meta);
  // document.getElementsByTagName('head')[0].appendChild(window.orientation === 0 ? narrow : wide);
  setTimeout(function () {
    window.scrollTo(0, 1);
  }, 10);
  
  // <meta name="viewport" content="width=720; user-scalable=no" />
}, false);

$('#hsn').html(highscores.length ? commafy(highscores[0].score) : '');

// event hook up
$('.newgame').touch(newGame);

$('#tweet').touch(function (event) {
  var msg = this.search.replace(/\?status=/, '');
    
  // this is nasty, but on the desktop, tweetie url scheme handler is different to mobile :(
  var tweetie = navigator.userAgent.indexOf('Mobile') === -1 ? 'tweetie:///' : 'tweetie:///post?message=';
  
  openURL(tweetie + msg, this.href);
  event.preventDefault();
});

$retryboard.touchClick(retryboard);

$('#levelup').touchClick(levelUpNewGame);
$('#highscore').touch(showHighscores);

$body.on('touchmove', prevent);


// bit of magic: if the browser supports a custom url scheme, and the
// custom scheme is supported, it'll redirect the browser window entirely.
// if it's not, it won't redirect, and the user will stil be able to play
// the game
window.location.search.replace(/\bseed=([^&=]*)\b/, function (m, seed) {
  var iframe = getIFrame();
  document.body.appendChild(iframe);
  iframe.onload = function () {
    document.body.removeChild(iframe);
  };
  
  // this pops up an ugly window in Mobile WebKit - would be nice to surpress it
  iframe.contentWindow.location = 'marbles:///?seed=' + seed;
  Marbles.seed(seed); // handle the web based game using the seed
});

// horrible, but adds a tiny bit of nice ux
if (!nativeapp && /iphone/i.test(navigator.userAgent) && !navigator.standalone && !playedBefore ) {
  try {
    localStorage.setItem('playedBefore', true);
  } catch (e) {}
  document.body.className = 'saveToSpring';
  $(document).oneTouchClick(removeSave);
  initDraw(true);
} else {
  // Run!
  if (window.Invoke_params) {
    Marbles.seed(window.Invoke_params.seed);
  }
  initDraw(true);
  $(document).on('deviceready', function () {
    document.body.className = '';
    setTimeout(startTimer, 1000);
  });
}

// event delegate the play button clicking
$highscoresWrapper.touch(function (event) {
  $body.removeClass('highscores');
});

if (window.PhoneGap && !window.PhoneGap.available) {
  $(document).fire('deviceready');
  // scroll the url bar out of view
  setTimeout(function () {
    // console.log('scroll jumped');
      
    window.scrollTo(0, 1);
  }, 10);
}

// console.log('app is ready', Marbles);