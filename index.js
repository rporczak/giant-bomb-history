var keys    = require('./config.js');
var moment  = require('moment');
var Random  = require('random-js');

var Client  = require('node-rest-client').Client;
var rest    = new Client();

var Twit    = require('twit');
var T       = new Twit(keys.twitter);


var args = {
  headers: {
    "User-Agent": "@TodayInGB -- Twitter bot. A handful of requests once every few hours.",
    "Content-Type": "application/json"
  }
};

exists = function (x) { return (typeof x !== "undefined" && x !== null); };

dmError = function (error) {
  dm = {
    'screen_name': 'tsiro',
    'text': ('ERROR: "' + error + '"')
  };
  T.post('direct_messages/new', dm, function(err, reply) {
    if (err) {
      console.log('error:', err);
    }
  });
};

getVideosURL = function (year) {
  var url = encodeURI(
    'http://www.giantbomb.com/api/videos/?' +
      'api_key=' + keys.gb +
      '&field_list=name,deck,id,publish_date,site_detail_url' +
      '&filter=publish_date:' + getTodayRange(year) +
      '&format=json'
  );

  return url;
};

getTodayRange = function (year) {
  var start, end;
  var today = Date.now();

  start = year + moment(Date.now()).startOf('day').format("-MM-DD") + " 00:00:00";
  end   = year + moment(Date.now()).endOf('day').format("-MM-DD")   + " 23:59:59";

  return start + "|" + end;
};

getYears = function () {
  var start = 2008;
  var end   = moment().year() - 1;
  var years = [];

  for (var y = start; y <= end; y++) {
    years.push(y);
  }

  return years;
};

fetchVideos = function (URLs, videos, cb) {
  var URL = URLs.shift();

  if (exists(URL)) {
    rest.get(URL, args, function (data) {
      if (data["error"] === "OK") {
        var results = data["results"];
        if (results.length !== 0) {
          for (var i = 0; i < results.length; i++) {
            videos.push(results[i]);
          }
        }
        fetchVideos(URLs, videos, cb);
      }
    });
  } else {
    cb(videos);
  }
};

pickVideo = function (videos, timeBias) {
  var time, index;
  var hour = moment().hour();

  if (hour >= 0 && hour < 8) {
    time = "Morning";
  } else if (hour >= 8 && hour < 16) {
    time = "Day";
  } else {
    time = "Evening";
  }

  index = timeBias.indexOf(time);

  return videos[index];
};

entry = function () {
  var random = new Random(
    Random.engines.mt19937().seed(moment().format("MMMM DD YYYY")));

  // Use the index of the time period in this to pull a deterministically
  //   random video from the videos list. This is to randomly distribute
  //   which time(s) won't get videos if a day has fewer than 3.
  var timeBias = ["Morning", "Day", "Evening"];
  random.shuffle(timeBias);

  var years = getYears();
  var URLs = [];

  for (var i = 0; i < years.length; i++) {
    var year      = years[i];
    var videosURL = getVideosURL(year);

    URLs.push(videosURL);
  }

  fetchVideos(URLs, [], function (results) {
    // console.log("results: ");
    // console.log(random.shuffle(results));

    // shuffle videos
    random.shuffle(results);
    var video = pickVideo(results, timeBias);

    var year    = moment(video["publish_date"]).year();
    var status  = video.name + " (" + year + ") " + video["site_detail_url"];
    var params  = { 'status': status };

    console.log(status);

    // T.post(
    //   'statuses/update',
    //   params,
    //   function (err, data, response) {
    //     if (!err) {
    //       console.log("Success!");
    //     }
    //   })


  });

};

entry();
