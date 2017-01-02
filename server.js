'use strict';

let os = require('os');
let nodeStatic = require('node-static');
let http = require('http');
let url = require('url');

let file = new nodeStatic.Server('./public');
let app = http.createServer(function(req, res) {
  let parsed = url.parse(req.url, true);
  if (parsed.path === "/strength") {
    getParams(req, parsed).then(params => {
      let {shared, hands, players} = params;
      let result = getPower(shared, hands, players);
      res.writeHead(200, {
        'Content-Type': 'text/json'});
      res.end(JSON.stringify(result));
    });
  } else {
    file.serve(req, res);
  }
}).listen(process.env.PORT || 8080);

let pokerData = require('./data.json');
console.log(`read ${pokerData.length} entries`);

// TODO(max): rewrite this.
// Test using
// curl -vX POST localhost:8080/strength -d @test_request.json
function getPower(shared, hands, players) {
  shared = strToCards(shared);
  return splitHands(strToCards(hands)).map(hand => {
    return {hand: hand, strength: .5};
  });
}

const CARD_VALUE = {
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

const SUIT = {
  D: '♢',
  H: '♡',
  C: '♧',
  S: '♤',
}

// Group every two cards into a list of its own.
function splitHands(l) {
  return l.reduce(function(result, value, index) {
    if (index % 2 === 0)
      result.push(l.slice(index, index + 2));
    return result;
  }, []);
}

// Takes a string of undelimited two letter cards and turns them into js objects.
function strToCards(s) {
  let result = [];
  let card = {};
  for (let i = 0; i < s.length; i++) {
    if (i % 2 == 0) {
      card.value = Number(s[i]);
      card.rendered = s[i].replace('T', '10');
      if (isNaN(card.value)) {
        card.value = CARD_VALUE[s[i]];
      }
    } else {
      card.suit = s[i];
      card.rendered += SUIT[s[i]];
      result.push(card);
      card = {};
    }
  }
  return result;
}

// Return a promise with the data either from the query string in case
// of GET or the JSON-encoded payload in case of a POST. Handles multi-part
// requests.
function getParams(request, parsed) {
  return new Promise(function(resolve, reject) {
    if (request.method == 'POST') {
      var body = '';
      
      request.on('data', function (chunk) {
        body += chunk;

        // Too much POST data, kill the connection!
        // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
        if (body.length > 1e6) {
          request.connection.destroy();
          reject('Too much data');
        }
      });

      request.on('end', function () {
        resolve(JSON.parse(body || "{}"));
      });
    } else if (request.method == 'GET') {
      resolve(parsed.query);
    }
  });
}
