/*global test:true, equal: true, Marbles: true */
function rungame(data) {
  var dim = { grid: [7,7], types: 3 },
      gameRunning = true,
      start,
      end,
      ok;

  Marbles.gameover(function () {
    gameRunning = false;
  });

  Marbles.newGame();
  Marbles.seed(data.seed);
  Marbles.init(dim.grid[0], dim.grid[1], dim.types);

  for (var level = 1; level <= data.level; level++) {
    start = data.tagged[level].start;
    end = data.tagged[level].end;
    if (end - start > 10 * 1000) {
      Marbles.bonusFinished();
    }
    
    for (var i = 0; i < data.tagged[level].taps.length; i++) {
      if (gameRunning) {
        Marbles.get(data.tagged[level].taps[i][0], data.tagged[level].taps[i][1]).tag();
        Marbles.clear();
      }
    }
    
    if (Marbles.marblesLeft() !== 0) {
      // end of game
      ok = data.score === Marbles.getScore() ? true : false;
    } else {
      // level up and continue
      gameRunning = true;
      Marbles.levelUp();
      Marbles.init(dim.grid[0], dim.grid[1], dim.types);
    }
  }
  
  return Marbles;
}

var data = {"date":"2012-10-24T04:18:39+00:00","data":{"tagged":{"1":{"taps":[[2,4],[1,3],[2,3],[1,0],[0,0],[5,5],[5,1],[5,0],[1,0],[1,2],[2,0],[1,0],[0,0]],"start":1351052060803,"end":1351052074705},"2":{"taps":[[1,4],[6,3],[2,3],[0,2],[1,0],[2,2],[3,0],[3,1],[2,1],[1,0],[0,0],[0,0]],"start":1351052075262,"end":1351052097815},"3":{"taps":[[5,2],[4,3],[1,0],[5,2],[1,0],[2,0],[0,0],[0,0]],"start":1351052100818,"end":1351052139927},"4":{"taps":[[5,0],[2,1],[3,5],[1,5],[3,2],[5,1],[3,0],[0,0]],"start":1351052142930,"end":1351052154025},"5":{"taps":[[4,3],[1,5],[5,2],[2,0],[2,0],[2,0],[1,0],[1,0],[1,0],[1,1]],"start":1351052154823,"end":1351052199959},"6":{"taps":[[5,2],[5,0],[4,0],[1,2],[1,1],[2,0],[1,0],[0,0]],"start":1351052202963,"end":1351052233373},"7":{"taps":[[1,5],[0,1],[2,5],[0,0],[1,0],[3,3],[1,0],[1,0]],"start":1351052236377,"end":1351052260705},"8":{"taps":[[0,1],[2,4],[2,4],[5,2],[4,1],[4,1],[1,1],[0,0]],"start":1351052263709,"end":1351052346073}},"seed":"50876AD9","score":7220,"level":8},"source":"http://marbles2.com","ip":"86.10.164.12"};

test('Simulate game', function () {
  Marbles.reset();
  var game = data.data;
  var result = rungame(game);

  equal(result.level, game.level, 'Level is ' + game.level);
  equal(result.getScore(), game.score, 'Score is ' + game.score);
});