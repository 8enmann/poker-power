'use strict';

require('newrelic');
let os = require('os');
let nodeStatic = require('node-static');
let http = require('http');
let url = require('url');

let file = new nodeStatic.Server('./public');
let app = http.createServer(function(req, res) {
  let parsed = url.parse(req.url, true);
  if (parsed.path === "/strength") {
    getParams(req, parsed).then(params => {
      let result = getPower(params.shared, params.hands, params.players);
      res.writeHead(200, {
        'Content-Type': 'text/json'});
      res.end(JSON.stringify(result));
    });
  } else {
    file.serve(req, res);
  }
}).listen(process.env.PORT || 8080);

let sorted7Hands = require('./sorted7Hands.json');//an array of instances arrays
console.log(`read ${sorted7Hands.length} hands`);
let flushCompletions = require('./flushCompletions.json');
console.log(`read ${flushCompletions.length} flush completions`);
let flushIndex = 16198;
let nchoosek = new Array(25);
initBinomial(nchoosek);

// TODO(max): rewrite this.
// Test using
// curl -vX POST localhost:8080/strength -d @test_request.json
function getPower(shared, hands, players) {
  shared = strToCards(shared);
  return splitHands(strToCards(hands)).map(hand => {
    let handPower = getHandPower(hand,shared);
    let expectedValue =  players*Math.pow(handPower,players-1);
    return {hand: hand, strength: handPower,ev:expectedValue.toFixed(2)};
  });
}

function getHandPower(holeCards,sharedCards){//hole cards are my two secret cards
  let myCards = joinCards(holeCards,sharedCards);
  let myInstances = countInstances(myCards);
  let opponentInstances = countInstances(sharedCards);
  let deckQuantity = newDeck();
  deckQuantity = arraySubtract(deckQuantity,myInstances);//the deck is missing cards that are showing
  let myFlushes = flushWays(myCards);
  let myWays = getWaysArray(deckQuantity,myInstances,myFlushes);
  let opponentFlushes = flushWays(sharedCards);
  let opponentWays = getWaysArray(deckQuantity,opponentInstances,opponentFlushes);
  let powerArray = accumulateFraction(opponentWays);
  let handPower = expectedValue(myWays,powerArray);
  return Math.round(handPower*1000)/1000;
}

function expectedValue(myWays,powerArray){
  //the expected value of my hand is the average of the power of each hand (to beat opponents' hands) weighted by the likelihood that I will get that hand
  let handPower = 0;
  let totalWays = total(myWays);
  for(let i=0;i<myWays.length;i++){
    handPower+=powerArray[i]*myWays[i]/totalWays;
  }
  return handPower;
}

function accumulateFraction(ways){
  //count the fraction of hands beat by other hands.
  //hands are sorted best to worst
  let betterWays = 0;
  let powerArray = new Array(ways.length);
  let totalWays = total(ways);
  for(let i=0;i<ways.length;i++){
    powerArray[i]=(totalWays-betterWays)/totalWays;//fraction of hands beat or tied by this hand
    betterWays += ways[i];
  }
  return powerArray;
}

function getWaysArray(deckQuantity,instances,flushes){//the ways array stores how many ways to get each of the possible 7hands in sorted7Hands. The flushes are added as a rough correction. Straight flushes are totally ignored. :/
  let allWays = new Array(sorted7Hands.length);
  let waysWorseThanFlush = 0;
  for(let i=0;i<sorted7Hands.length;i++){
    allWays[i]=numberOfWays(deckQuantity,arraySubtract(sorted7Hands[i],instances));
    if(i>16198)
      waysWorseThanFlush+=allWays[i];
  }
  //flushes are implemented with an approximation, not legitimately calculated
  if(waysWorseThanFlush>0){
    let flushFudgeFactor = (waysWorseThanFlush-flushes)/Math.max(waysWorseThanFlush,1);
    for(let i=16199;i<sorted7Hands.length;i++){
      allWays[i]*=flushFudgeFactor;//this fudge factor conserves draws. Worse hands are made into flushes indiscriminately.
    }
  }
  allWays[16198]=flushes;//all the flushes are dumped into a single entry. Yeah it sucks, how 'bout you do it better?
  return allWays;
}

function joinCards(cards1,cards2){
  let allCards = [];
  cards1.forEach(card => {allCards.push(card);});
  cards2.forEach(card => {allCards.push(card);});
  return allCards;
}

function arraySubtract(array1,array2){
  let newArray = array1.slice();
  for(let i=0;i<array1.length;i++)newArray[i]=newArray[i]-array2[i];
  return newArray;
}

function total(array){
  let count = 0;
  for(let i=0;i<array.length;i++){
    count+=array[i];
  }
  return count;
}

function flushWays(cards){//compute all flush possibilities for all suits
  let totalWays = 0;
  let suitCounts = countSuits(cards);
  let numberOfCards = total(suitCounts);
  for(let suit=0;suit<4;suit++){
    let additionalWays = numberOfFlushes(suitCounts[suit],numberOfCards-suitCounts[suit]);
    totalWays+=additionalWays;
  }
  return totalWays
}

function numberOfFlushes(matchingSuits,nonMatchingSuits){//lookup table for how many flushes of a given suit
  return flushCompletions[matchingSuits*8+nonMatchingSuits][2]
}

function countInstances(cards){
  //instances[0] is the number of cards with value 1. In poker, these are "2". *sigh*
  let instances = new Array(13);
  for(let i=0;i<13;i++)instances[i]=0;//initialize array of instances to zeros
  for(let i=0;i<cards.length;i++) instances[cards[i].value-1]++;
  return instances;
}

function countSuits(cards){
  //instances[0] is the number of cards with value 1. In poker, these are "2". *sigh*
  let suitCounts = [0,0,0,0];
  for(let i=0;i<cards.length;i++) suitCounts[SUIT_NUMBERS[cards[i].suit]-1]++;
  return suitCounts;
}

function newDeck(){//setup a deck with 4 of each suit
  return [4,4,4,4,4,4,4,4,4,4,4,4,4];
}

function numberOfWays(deckQuantity,instances){
  //deckQuantity is ordinarily an array of length 13, each element being 4
  //instances is an array of length 13, each element being how many cards of that value are in a hand
  let product = 1;
  for(let i=0;i<13;i++){
    if(instances[i]>4){//can't have more than 4 of a card. the main list wasn't pruned for this. probably should have been.
      return 0;
    }
    product*=choose(deckQuantity[i],instances[i]);
    if(product==0)break;
  }
  return product
}

function initBinomial(nchoosek){
  //prepare the n choose k lookup table
  for(let x=0;x<5;x++){
    for(let y=0;y<5;y++){
      nchoosek[5*x+y]=Math.abs(binomial(x,y));
    }
  }
}
function choose(n,k){//uses a lookup table to get "n choose k"
  if(n<k){
    if(k==0)return 1;
    else return 0;
  }
  if(k<0)return 0;
  
  return nchoosek[5*n+k];
}
function binomial(n,k){
  //gives the binomial coefficient describing the number of ways to choose k elements from n elements
  let product = 1;
  for(let i=1;i<k+1;i++){
    product*=(n+1-i)/i;
  }
  return product;
}

const CARD_VALUE = {
  T: 9,
  J: 10,
  Q: 11,
  K: 12,
  A: 13,
}

const SUIT = {
  D: '♢',
  H: '♡',
  C: '♧',
  S: '♤',
}

const SUIT_NUMBERS = {
  D: 1,
  H: 2,
  C: 3,
  S: 4,
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
      }else{
        card.value--;
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

getHandPower(strToCards('4H4C'),strToCards('4D4S'))
//let deckQuantity = newDeck();
//let holeCards = strToCards('4H4C');
//let instances = countInstances(joinCards(holeCards,strToCards('4D4S')));
////deckQuantity = arraySubtract(deckQuantity,countInstances(holeCards));
//let index = 50382;
//console.log(instances);
//console.log(deckQuantity);
//let remainingInstances = arraySubtract([0,0,4,3,0,0,0,0,0,0,0,0,0],instances);
//console.log(remainingInstances);
//console.log(numberOfWays(deckQuantity,remainingInstances));
