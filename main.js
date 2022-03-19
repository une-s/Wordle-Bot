(function() {
  const start = Date.now();
  const fs = require('fs');
  const WordleBot = require('./js/wordlebot.js');
  const outputFile = './out/wordlebot-output.txt';
  let solutionList;
  let guessList;
  
  fs.readFile('./data/solution-list.txt', 'utf8', (err, data) => {
    if(err) {
      throw new Error("Couldn't open solution word list", {cause: err});
    }
    solutionList = data.trim().split(/\r?\n/);
    startIfLoaded();
  });
  fs.readFile('./data/guess-list.txt', 'utf8', (err, data) => {
    if (err) {
      throw new Error("Couldn't open guess word list", {cause: err});
    }
    guessList = data.trim().split(/\r?\n/);
    startIfLoaded();
  });
  
  function startIfLoaded() {
    if(solutionList && guessList) {
      const bot = new WordleBot(solutionList, guessList);
      delete solutionList;
      delete guessList;
      const result = bot.buildMemoryAll();
      fs.writeFile(outputFile, result.dataText, (err) => {
        if (err) {
          throw new Error("An error occurred while writing the Wordle bot output file.", {cause: err});
        }
        else {
          console.log('Successfully wrote output to "' + outputFile + '"');
          console.log('The bot got an average score of ' + result.average.toFixed(4) + '.');
        }
        const end = Date.now();
        console.log('Completed in ' + ((end - start)/1000).toFixed(4) + ' seconds.');
      });
    }
  }
})();