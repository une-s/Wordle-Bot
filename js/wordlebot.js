module.exports = (function() {

  var READY_TO_GUESS = 0;
  var AWAITING_RESPONSE = 1;
  var WIN = 2;
  var LOSE = 3;

  var WordleBot = function(solutionList, guessList, maxGuesses = 6) {
    this._solutionList = canonize(solutionList);
    if (guessList && guessList !== solutionList) {
      this._guessList = canonize(guessList.concat(this._solutionList));
    }
    else {
      this._guessList = this._solutionList;
    }
    this._firstGuess = undefined;
    this._guessCache = {};
    this._maxGuesses = maxGuesses;
    this._statistics = [];
    for(var i = 0; i <= maxGuesses; i++) {
      this._statistics[i] = 0;
    }
    this.reset();
  };
  
  Object.defineProperty(WordleBot.prototype, 'hasFinished', {
    get: function() { return this.hasWon || this.hasLost; }
  });
  Object.defineProperty(WordleBot.prototype, 'hasLost', {
    get: function() { return this._status === LOSE; }
  });
  Object.defineProperty(WordleBot.prototype, 'hasWon', {
    get: function() { return this._status === WIN; }
  });
  Object.defineProperty(WordleBot.prototype, 'isAwaitingResponse', {
    get: function() { return this._status === AWAITING_RESPONSE; }
  });
  Object.defineProperty(WordleBot.prototype, 'isReadyToGuess', {
    get: function() { return this._status === READY_TO_GUESS; }
  });
  Object.defineProperty(WordleBot.prototype, 'maxGuesses', {
    get: function() { return this._maxGuesses; }
  });
  Object.defineProperty(WordleBot.prototype, 'numGuesses', {
    get: function() { return this._guesses.length; }
  });
  Object.defineProperty(WordleBot.prototype, 'numLetters', {
    get: function() { return this._solutionList[0].length; }
  });
  Object.defineProperty(WordleBot.prototype, 'numResponses', {
    get: function() { return this._responses.length; }
  });
  WordleBot.prototype.buildMemoryAll = function buildMemoryAll() {
    var oldStats = this._statistics.slice();
    var dataText = '';
    this._solutionList.forEach(solution => {
      while (!this.hasFinished) {
        var guess = this.guess();
        var response = makeResponse(solution, guess);
        this.respond(response);
      }
      dataText += this._guesses.join(',')+'\r\n';
      this.reset();
    });
    var avg = 0;
    this._statistics.forEach((count, idx) => avg += (idx+1)*(count - oldStats[idx]));
    avg /= this._solutionList.length;
    return {
      dataText: dataText,
      average: avg
    };
  };
  WordleBot.prototype.buildMemoryRandom = function buildMemoryRandom(n = 1) {
    var oldStats = this._statistics.slice();
    var dataText = '';
    for (var i = 0; i < n; i++) {
      var solution = this._solutionList[Math.floor(n*Math.random())];
      while (!this.hasFinished) {
        var guess = this.guess();
        var response = makeResponse(solution, guess);
        this.respond(response);
      }
      dataText += this._guesses.join(',')+'\r\n';
      this.reset();
    }
    var avg = 0;
    this._statistics.forEach((count, idx) => avg += (idx+1)*(count - oldStats[idx]));
    avg /= n;
    return {
      dataText: dataText,
      average: avg
    };
  };
  WordleBot.prototype.guess = function guess() {
    if (this.hasFinished) {
      throw new TypeError('Call reset to start a new game');
    }
    if (!this.isReadyToGuess) {
      throw new TypeError('The bot needs a response to its previous guess first.');
    }
    var fromCache = getCachedGuess.call(this);
    if (fromCache) {
      return setAndReturnGuess.call(this, fromCache, false);
    }
    if (this._remainingSolutions.length === 1) {
      return setAndReturnGuess.call(this, this._remainingSolutions[0]);
    }
    var pow = Math.pow(3, this.numLetters);
    var bestGuesses;
    var bestStats = [Infinity];
    this._guessList.forEach(guess => {
      var stats = [];
      var badGuess = false;
      this._remainingSolutions.forEach(word => {
        var statIdx = 0;
        for (var i = 0, j = 1; i < this.numLetters; i++, j *= 3) {
          var ch = guess.charAt(i);
          if (word.charAt(i) === ch) {
            statIdx += 2*j;
          }
          else if (word.indexOf(ch) >= 0) {
            statIdx += j;
          }
        }
        stats[statIdx] = (stats[statIdx] || 0) + 1;
        if (stats[statIdx] > bestStats[0]) {
          badGuess = true;
          return;
        }
      });
      if (badGuess) {
        return;
      }
      stats = stats.map(count => count || 0).sort((a,b) => b-a);
      for (var i = 0; i < pow; i++) {
        if (stats[i] < bestStats[i]) {
          bestStats = stats;
          bestGuesses = [];
          break;
        }
        if (stats[i] > bestStats[i]) {
          return;
        }
      }
      bestGuesses.push(guess);
    });
    if (bestGuesses.length > 0) {
      var bestGuesses2 = [];
      bestGuesses.forEach(guess => {
        if (this._remainingSolutions.includes(guess)) {
          bestGuesses2.push(guess);
        }
      });
      if (bestGuesses2.length > 0) {
        bestGuesses = bestGuesses2;
      }
    }
    var guess = bestGuesses[0];
    if(guess) {
      return setAndReturnGuess.call(this, guess);
    } else {
      throw new Error('The bot failed to guess');
    }
  };
  WordleBot.prototype.reset = function reset() {
    this._remainingSolutions = this._solutionList;
    this._guesses = [];
    this._responses = [];
    setStatus.call(this, READY_TO_GUESS);
  };
  WordleBot.prototype.respond = function respond(response) {
    if (this.hasFinished) {
      throw new TypeError('Call reset to start a new game');
    }
    if (!this.isAwaitingResponse) {
      throw new TypeError('The bot needs to guess before receiving a response.');
    }
    if (!response.match('^[0-2]{'+this.numLetters+'}$')) {
      throw new SyntaxError('Respond with a string of digits: '
          + '0 for excluded letter, 1 for misplaced letter, 2 for letter in right place');
    }
    this._responses.push(response);
    var guess = this._guesses[this.numGuesses-1];
    if (!!response.match('^2{'+this.numLetters+'}$')) {
      this._remainingSolutions = [guess];
      setStatus.call(this, WIN);
      return;
    }
    response = parseInt(response.split('').reverse().join(""), 3);
    var filteredList = [];
    this._remainingSolutions.forEach(word => {
      var res = response;
      for (var i = 0; i < this.numLetters; i++) {
        var ch = guess.charAt(i);
        var mod = res % 3;
        var expectedMod =
            word.charAt(i) === ch ? 2 :
            word.indexOf(ch) >= 0 ? 1 : 0;
        if (mod !== expectedMod) {
          return;
        }
        res = (res/3)|0;
      }
      filteredList.push(word);
    });
    this._remainingSolutions = filteredList;
    if (this._remainingSolutions.length === 0) {
      throw new Error('No more possible solutions exist!');
    }
    var hasLost = this.numGuesses === this.maxGuesses;
    setStatus.call(this, hasLost ? LOSE : READY_TO_GUESS);
  };
  WordleBot.prototype.respondAndGuess = function respondAndGuess(response) {
    this.respond(response);
    return this.guess();
  };
  function canonize(list) {
    list = list.map(word => word.toLowerCase()).sort();
    if (!list.length) {
      throw new TypeError('Word list is empty');
    }
    var wordLength = list[0].length;
    if (wordLength === 0) {
      throw new TypeError("Word length can't be 0");
    }
    var regex = new RegExp('^[a-z]{' + wordLength + '}$');
    var hasDupes = false;
    var lastWord = '';
    list.forEach(word => {
      if (word.length !== wordLength) {
        throw new TypeError('List has mixed word lengths: '
            + wordLength + ', ' + word.length);
      }
      if (!word.match(regex)) {
        throw new TypeError('Word has illegal characters: ' + word);
      }
      if (word === lastWord) {
        hasDupes = true;
      }
      lastWord = word;
    });
    if (hasDupes) {
      lastWord = '';
      var newList = [];
      list.forEach(word => {
        if (word !== lastWord) {
          newList.push(word);
        }
        lastWord = word;
      });
      list = newList;
    }
    return list;
  }
  function getCachedGuess() {
    var cache = this._guessCache;
    for (var i = 0; i < this.numResponses; i++) {
      if (!cache.r || !(cache = cache.r[this._responses[i]])) {
        return;
      }
    }
    return cache.g;
  };
  function makeResponse(solution, guess) {
    var response = '';
    for(var i = 0; i < guess.length; i++) {
      var ch = guess.charAt(i);
      response +=
          solution.charAt(i) === ch ? '2' :
          solution.indexOf(ch) >= 0 ? '1' : '0';
    }
    return response;
  };
  function setAndReturnGuess(guess, updateCache = true) {
    this._guesses.push(guess);
    if(updateCache) {
      setCachedGuess.call(this, guess);
    }
    setStatus.call(this, AWAITING_RESPONSE);
    return guess;
  };
  function setCachedGuess(guess) {
    var cache = this._guessCache;
    for (var i = 0; i < this.numResponses; i++) {
      var response = this._responses[i];
      if (!cache.r) {
        cache.r = {};
      }
      if(!cache.r[response]) {
        cache.r[response] = {};
      }
      cache = cache.r[response];
    }
    cache.g = guess;
  };
  function setStatus(status) {
    this._status = status;
    switch(status) {
      case WIN:
        var guessOrGuesses = (this.numGuesses === 1) ? ' guess!' : ' guesses!';
        console.log('The bot wins in ' + this.numGuesses + guessOrGuesses);
        this._statistics[this.numGuesses - 1]++;
        break;
      case LOSE:
        console.log('The bot loses.');
        this._statistics[this.maxGuesses]++;
        break;
      default:
        break;
    }
  };
  return WordleBot;
})();