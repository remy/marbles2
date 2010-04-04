/*
	@author: remy sharp
	@info: http://leftlogic.com/marbles/
	@date: 2007-06-13
	@description: Marbles Squared game based directly on Marbles Squared for Palm OS
*/

var Marble = function (x, y, type, tagged) {  
  if (!tagged) tagged = false;

  this.x = x;
  this.y = y;
  this.type = type;
  this.tagged = tagged;
};

Marble.prototype.info = function () {
  return 'left: ' + this.left + ', right: ' + this.right + ', up: ' + this.up + ', down: ' + this.down;
};

Marble.prototype.toString = function () {
  return (this.tagged ? '[' + this.type + ']' : ' ' + this.type + ' ');
};
Marble.prototype.copy = function () {
  var mb = new Marble(this.x, this.y, this.type);
  mb.tagged = this.tagged;
  return mb;
};
Marble.prototype.tag = function (fn) {
  Marbles.history.tagged[Marbles.level].push([this.x,this.y]);
  return (Marbles.activeTags ? false : Marbles.tag(this.x, this.y, fn));
};
Marble.prototype.hasPartner = function() {
  return !!(this.right || this.up || this.left || this.down);
};

// global marbles object
var Marbles = (function (undefined) {
  var Utils = (function (undefined) {
    var RandSeed = ~~(+new Date / 1000); // ditch the milliseconds

    // Rand32B
    function random() { // different sequence to Math.random()
      var T16 = 0x10000, T32 = T16*T16,
          cons = 0x0808, tant = 0x8405, // cons*T16 + tant = 134775813
          X = RandSeed*cons % T16 * T16 + RandSeed*tant + 1; // Exact 32=bit arithmetic
      return (RandSeed = X % T32) / T32; 
    }

    return {
      random: random,
      seed: function (seed) {
        if (seed === true) {
          RandSeed = ~~(+new Date / 1000);
        } else if (seed !== undefined) {
          RandSeed = seed;
        }
        return RandSeed;
      }
    };
  })();
  
  function getMarble(x, y) {
    return marbles[x] && marbles[x][y] ? marbles[x][y] : null;
  }

  var marbles = [],
      empty = ' ',
      // trackers
      score = 0,
      marblesLeft = 0,
      active = false,
      taggedCount = 0,
      mygo = true,
      timeBonus = 1000,
      seed = Utils.seed(),
      gameoverCallback = null;

  return {
    activeTags: false,
    allowSingles: false,
    level: 1,
    history: { tagged: {1:[]}, seed: seed.toString(16).toUpperCase(), score: score, level: 1 }, // use to submit scores to the server
    gameover: function (fn) {
      if (typeof fn == 'function') {
        gameoverCallback = fn;
        return this;
      }
      
      score += this.bonus();
      
      this.history.score = this.getScore();
      this.history.level = this.level;
      gameoverCallback.call(this);
      
      return this;
    },
    bonusFinished: function () {
      timeBonus = 0;
    },
    seed: function (n) {
      if (n !== undefined) {
        Utils.seed(parseInt(n, 16)); 
        seed = n;
      } 
      return seed.toString(16).toUpperCase();
    },
    tag: function (x, y, fn) {
      function tagUtil (dir) {
        if (m[dir] && !m[dir].tagged) {
          Marbles.tag(m[dir].x, m[dir].y, fn);
        }
      }

      var m = getMarble(x,y);

      // can't tag empty blocks
      if (!m.type || m.tagged) return false; 

      // don't tag if it's alone
      if (!this.allowSingles && !m.hasPartner()) return false;

      m.tagged = true;
      taggedCount++;

      tagUtil('left');
      tagUtil('right');
      tagUtil('up');
      tagUtil('down');

      this.activeTags = true;
      this.drawMarble(x, y, m.tagged, m.type);
      return this;
    },
    
    drawMarble: function () {}, // dummy handler
    
    newGame: function () {
      this.level = 1;
      score = 0;
      seed = Utils.seed();
      this.history = { tagged: {1: []}, seed: this.seed(), score: score, level: this.level };
      return this;
    },
    
    levelUp: function () {
      score = this.getScore();
      this.level++;
      this.history.tagged[this.level] = [];
      return this;
    },
    
    init: function (w, h, types) {
      var i, j;

      if (!types) types = this.types || 4; // using ! rather then typeof to ensure > 0
      if (!h && !!(w)) h = this.height || w;
      else if (!h) h = this.height || 10;

      if (!w) w = this.width || 10;

      this.width = w;
      this.height = h;
      this.types = types;
      
      this.reset();
      marblesLeft = w * h;
      this.align();
      return this;
    },

    reset: function () {
      marblesLeft = 0;
      active = true;
      taggedCount = 0;
      timeBonus = 1000;
      this.activeTags = false;

      marbles = [];

      // create a matrix of marbles going left to right, down to up
      return this.loop(function (x, y) {
        if (!marbles[x]) marbles[x] = [];
        marbles[x].push(new Marble(x, y, ~~(Utils.random()*this.types)+1));
      });
    },
    
    align: function () {
      var i, j;

      function store(x, y, x2, y2, pos) {
        getMarble(x,y)[pos] = null; // reset
        if (marbles[x2] && getMarble(x2,y2) && getMarble(x2,y2).type == getMarble(x,y).type && getMarble(x,y).type != empty)
          getMarble(x,y)[pos] = getMarble(x2,y2);
      }

      this.loop(function (x, y) {
        store(x, y, x-1, y, 'left');
        store(x, y, x+1, y, 'right');
        store(x, y, x, y-1, 'down');
        store(x, y, x, y+1, 'up');
      });
      
      // check whether the game is still going
      if (!this.movesLeft()) active = false;
      return this;
    },
    
    score: function () {
      return taggedCount * (5 + taggedCount);
    },
    
    getScore: function () {
      return score;
    },
    
    bonus: function () {
      var bonus = 0;

      if (active) { // no bonus during active games
        return bonus; 
      }
      
      if (!active && marblesLeft == 0) {
        bonus = 300 + timeBonus;
      } else if (!active && marblesLeft <= 5) {
        bonus = 150;
      }
      
      return bonus;
    },
        
    untag: function () {
      this.loop(function (x, y) {
        var m = getMarble(x, y);
        if (m.tagged) {
          m.tagged = false;
          this.drawMarble(x, y, m.tagged, m.type);
        }                
      });
      
      this.activeTags = false;
      taggedCount = 0;
      return this;
    },
    
    clear: function (fn) {
      var x, y, i, mb, w = this.width, h = this.height;
      if (this.activeTags) {
        score += this.score();
        // go left to right, down to up clearing columns
        for (x = 0; x < w; x++) {
          for (y = 0; y < w; y++) {
            while (getMarble(x,y).tagged) {
              mb = getMarble(x,y);
              mb.type = empty;
              marblesLeft--;
              mb.tagged = false;
              // go up until we find untagged or end
              for (i = y; i < h; i++) {
                if (getMarble(x,i+1)) { // if there's a block above
                  this.swapY(x,i,1,fn);
                } else if (y == h-1) { // top row
                  this.drawMarble(x, y, mb.tagged, mb.type);
                }
              }
            }                        
          }
        }
      }
      
      // check for empty columns and shuffle them left
      this.loop('x', function (x) {
        mb = getMarble(x, 0);
        if (mb.type === empty) { // implies empty column
          // find the next column with marbles
          for (i = x + 1; i < w; i++) {
            if (getMarble(i,0).type !== empty) {
              this.loop('y', function (y) {
                this.swapX(i, y, x - i, fn);
              });
              i = w; // end loop
            }
          }
        }
      });
      
      this.untag();
      this.align();
      
      if (this.movesLeft() === 0) {
        this.gameover();
      }
      
      return this;
    },
    
    marblesLeft: function () {
      return marblesLeft;
    },
    
    movesLeft: function () {
      var movesLeft = 0;
      this.loop(function (x,y) {
        if (!movesLeft && getMarble(x,y).hasPartner()) movesLeft = true;
      });
      
      if (movesLeft === 0) {
        active = false;
      }

      return movesLeft;
    },
    
    swapX: function (x1, y1, xInc, fn) {
      var x2 = x1 + xInc,
          m1 = getMarble(x1,y1),
          m2 = getMarble(x2,y1);
      
      marbles[x1][y1] = new Marble(x1,y1,m2.type,m2.tagged);
      marbles[x2][y1] = new Marble(x2,y1,m1.type,m1.tagged);
      
      this.drawMarble(x1, y1, m2.tagged, m2.type);
      this.drawMarble(x2, y1, m1.tagged, m1.type);
      
      return this;
    },
    
    swapY: function (x1, y1, yInc, fn) {
      var y2 = y1 + yInc,
          m1 = getMarble(x1,y1),
          m2 = getMarble(x1,y2);
      
      marbles[x1][y1] = new Marble(x1,y1,m2.type,m2.tagged);
      marbles[x1][y2] = new Marble(x1,y2,m1.type,m1.tagged);

      this.drawMarble(x1, y1, m2.tagged, m2.type);
      this.drawMarble(x1, y2, m1.tagged, m1.type);
      
      return this;
    },
    
    // ensures we loop in the right direction - bottom left, top right.
    // if dir is passed in, only loop 'x' or 'y'
    loop: function (dir, fn) {
      if (fn === undefined) {
        fn = dir;
        dir = null;
      }
      
      var x, y, i, 
					callback = !!(typeof fn == 'function'), 
					h = this.height, 
					w = this.width, 
					loop = (dir == 'x' ? w : h);
      
      if (!dir) {
        for (y = 0; y < h; y++) {
          for (x = 0; x < w; x++) {
            if (callback) fn.call(this, x, y);
          }
        }
      } else {
        for (i = 0; i < loop; i++) {
          if (callback) fn.call(this, i);
        }
      }
      
      return this;
    },
    
    dump: function () {
      var d = '';
      var lastY = 0;
      this.loop(function (x, y) {
        if (lastY != y) d += "\n";
        lastY = y;
        d += getMarble(x,y);
      });

      return d;
    },
    // serialisation and restoring works, but can't be used, because it would involve
    // restoring the score, which could lead to cheating (or scores that we couldn't
    // validate).
/*/    
    serialize: function () {
      var d = '';
      this.loop(function (x, y) {
        d += getMarble(x,y).type;
      });

      return d;      
    },
    
    load: function (state) {
      return this.loop(function (x, y) {
        var m = getMarble(x, y);
        m.type = state.substr(x+(this.width*y), 1);
        this.move(x, y, m.tagged, m.type);
      });
    },
//*/  
    get: function (x,y) {
      return getMarble(x,y);
    }
  };
})();