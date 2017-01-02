'use strict';


var app = new Vue({
  el: '#app',
  data: {
    hands: '',
    shared: '',
    players: '',
    results: [],
  }
});

$('#submit').click(function(e) {
  e.preventDefault();
  console.log(app.hands);
  // Remove non-alphanum chars, normalize case, replace 10s with 'T'.
  let cleanedHand = normalize(app.hands);
  
  if (!cleanedHand || cleanedHand.length % 2 != 0) {
    $('#hands').parent().addClass('has-danger');
    return false;
  } else {
    $('#hands').parent().removeClass('has-danger');
  }
  fetch('/strength', {method: 'POST', body: JSON.stringify({
    hands: cleanedHand,
    shared: normalize(app.shared),
    players: app.players,
  })}).then(response => {
    return response.json();
  }).then(x => {
    console.log(x);
    app.results = x;
  });

  return false;
});

function normalize(rawCards) {
  return rawCards
    .replace(/[^0-9A-Za-z]/g, '')
    .replace(/10/g, 'T')
    .toUpperCase();
}
