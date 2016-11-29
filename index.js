var keys    = require('./config.js');
var moment  = require('moment');
var Random  = require('random-js');

var Client  = require('node-rest-client').Client;
var rest    = new Client();

var Twit    = require('twit');
var T       = new Twit(keys.twitter);

var args = {
  headers: {
    "User-Agent": "@TodayInGB -- Twitter bot. A handful /videos/ of requests once every couple hours.",
    "Content-Type": "application/json"
  }
};

exists = function (x) { return (typeof x !== "undefined" && x !== null); };

twoHoursIsh = function () {
  var TWO_HOURS       = 1000 * 60 * 60 * 2;
  var THIRTY_MINUTES  = 1000 * 60 * 30;
  var WIGGLE_ROOM     =
    Math.floor(2 * THIRTY_MINUTES * Math.random()) - THIRTY_MINUTES;

  return TWO_HOURS + WIGGLE_ROOM;
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

getVideosURL = function (year) {
  var start, end;
  var today = Date.now();

  start = year + moment(Date.now()).startOf('day').format("-MM-DD") + " 00:00:00";
  end   = year + moment(Date.now()).endOf('day').format("-MM-DD")   + " 23:59:59";

  var yearRange = start + "|" + end;
  var url = encodeURI(
    'http://www.giantbomb.com/api/videos/?' +
      'api_key=' + keys.gb +
      '&field_list=name,deck,id,publish_date,site_detail_url' +
      '&filter=publish_date:' + yearRange +
      '&format=json'
  );

  return url;
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

getTwitterStatus = function (cb) {
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
    random.shuffle(results);
    var video = pickVideo(results, timeBias);

    var date    = moment(video["publish_date"]).format("MMM DD, YYYY");
    var status  = video.name + " (" + date + ") " + video["site_detail_url"];

    var out = {
      error:  null,
      name:   video.name,
      date:   date,
      status: status
    };

    cb(out);
  });
};

handleError = function (error) {
  dm = {
    'screen_name': 'tsiro',
    'text': ('ERROR: "' + error + '"')
  };

  T.post('direct_messages/new', dm, function(err, reply) {
    if (err) {
      console.log('error:', err);
    }
  });

  setTimeout(theHat, twoHoursIsh());
};

theHat = function () {
  T.get(
    'users/search', { "q":"TodayInGB" },
    function (err, data, response) {
      if (!exists(err) && exists(data) && exists(data[0])) {
        var screen_name = data[0].screen_name;
        var lastStatus  = data[0].status;

        if (screen_name === "TodayInGB" && exists(lastStatus)) {
          var status_text = lastStatus.text;

          getTwitterStatus(function(data) {
            var error   = data.error;
            var name    = data.name;
            var date    = data.date;
            var status  = data.status;

            var safeName = name.slice(0, (139 - 4 - date.length));

            if (status_text.indexOf(safeName + " (" + date + ")") === -1) {
              T.post(
                'statuses/update', { 'status': status },
                function (err, data, response) {
                  if (!err) {
                    console.log("Success!");
                  }
                  // setTimeout(theHat, twoHoursIsh());
                }
              );
            }
          });
        }
      }
    }
  )
};

theHat();
