var keys    = require('./config.js');
var moment  = require('moment-timezone');
var Random  = require('random-js');

var Client  = require('node-rest-client').Client;
var rest    = new Client();

var Twit    = require('twit');
var T       = new Twit(keys.twitter);

var args = {
  headers: {
    "User-Agent": "@ThisDayInGB -- Twitter bot. A handful of /videos/ requests once every couple hours.",
    "Content-Type": "application/json"
  }
};

exists = function (x) { return (typeof x !== "undefined" && x !== null); };

getTime = function () { return moment().tz("America/Los_Angeles").unix() * 1000; }

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
  var today = getTime();

  start = year + moment(getTime()).startOf('day').format("-MM-DD") + " 00:00:00";
  end   = year + moment(getTime()).endOf('day').format("-MM-DD")   + " 23:59:59";

  var yearRange = start + "|" + end;
  var url = encodeURI(
    'http://www.giantbomb.com/api/videos/?' +
      'api_key=' + keys.gb +
      '&field_list=name,deck,id,publish_date,site_detail_url,video_type' +
      '&filter=publish_date:' + yearRange +
      '&format=json'
  );

  return url;
};

fetchVideos = function (URLs, videos, cb) {
  // 2016-11-28 rporczak -- Recursively fetching videos from URLs,
  //   pushing them into the videos array. Calling cb when we're done.

  var URL = URLs.shift();

  if (exists(URL)) {
    console.log("   Fetching videos from: " + URL);

    rest.get(URL, args, function (data) {
      if (data["error"] === "OK") {
        // 2016-11-28 rporczak -- Got video, no error.
        console.log("     -> Got videos.");
        var results = data["results"];
        if (results.length !== 0) {
          for (var i = 0; i < results.length; i++) {
            if (results[i]["video_type"] !== "Trailers") {
              videos.push(results[i]);
            }
          }
        }
        fetchVideos(URLs, videos, cb);
      } else {
        // 2016-11-28 rporczak -- Fetch failed. Assume the worst
        //   and throw up our hands. We can always try later!
        console.log("     -> ERROR.");
        throw (new Error("/videos/ fetch failed: " + data["error"]))
      }
    });
  } else {
    cb(videos);
  }
};

pickVideo = function (videos, timeBias) {
  var time, index;
  var hour = moment().hour();

  if (hour >= 4 && hour < 10) {
    time = "Morning";
  } else if (hour >= 10 && hour < 18) {
    time = "Day";
  } else if (hour >= 18 && hour < 24) {
    time = "Evening";
  } else {
    time = "";
  }

  index = timeBias.indexOf(time);

  return videos[index];
};

getTweetText = function (video) {
  // 2016-11-29 rporczak -- Generate the text of the tweet. Do some
  //   basic date math to get elapsed time. Tweet date format is:
  //   "[video name] ([video date], N year[s] ago)"
  var date      = moment(video["publish_date"]).format("MMM DD, YYYY");

  var thisYear  = moment().tz("America/Los_Angeles").year();
  var years     = thisYear - moment(video["publish_date"]).year();
  var yearStr   = "year";
  if (years !== 1) { yearStr = "years"; }

  var timeStr   = " (" + date + ", " + years + " " + yearStr + " ago) ";

  // 2016-11-29 rporczak -- Tweet length is 140 characters, links add 23
  //   characters, timeStr is dynamic, so count it on the fly.
  var MAX_NAME_LENGTH = 140 - 23 - timeStr.length;
  var safeName = video.name;
  if (safeName.length > MAX_NAME_LENGTH) {
    safeName = safeName.slice(0, MAX_NAME_LENGTH-1) + "…";
  }

  var tweetText = safeName + timeStr;

  return tweetText;
}

getTwitterStatus = function (cb) {
  // 2016-11-28 rporczak -- Generating twitter status by fetching Giant Bomb
  //   videos on this day for the past year.
  console.log("   Fetching Giant Bomb videos...");

  var random = new Random(
    Random.engines.mt19937().seed(moment().format("MMMM DD YYYY")));

  // Use the index of the time period in this to pull a deterministically
  //   random video from the videos list. This is to randomly distribute
  //   which time(s) won't get videos if a day has fewer than 3.
  var timeBias = ["Morning", "Day", "Evening"];
  random.shuffle(timeBias);

  var years = getYears();
  var URLs  = [];

  for (var i = 0; i < years.length; i++) {
    var year      = years[i];
    var videosURL = getVideosURL(year);

    URLs.push(videosURL);
  }

  try {
    fetchVideos(URLs, [], function (results) {
      // 2016-11-28 rporczak -- Video fetching complete.
      console.log("   Video list compiled.");

      random.shuffle(results);
      console.log("     -> num results: ", results.length);

      var video = pickVideo(results, timeBias);
      console.log("     -> chose video: ", video.name);

      if (exists(video)) {
        // 2016-11-28 rporczak -- The video exists for this time of day.
        var tweetText = getTweetText(video);
        var status    = tweetText + video["site_detail_url"];
        var out       = {
          error:      null,
          tweetText:  tweetText,
          status:     status
        };

        cb(out);
      } else {
        // 2016-11-28 rporczak -- It's possible that a video does not exist for
        //   time of day!
        var out = {
          error:  null,
          name:   null,
          date:   null,
          status: null
        };

        cb(out);
      }
    });

  } catch (err) {
    var out = {
      error:  err,
      name:   null,
      date:   null,
      status: null
    };

    cb(out);
  }
};


handleError = function (error) {
  // 2016-11-28 rporczak -- General error handler. DM me an
  //   error and go to sleep for a while.
  console.log("!! ERROR: ", error);

  dm = {
    'screen_name': 'tsiro',
    'text': ('ERROR: "' + error + '"')
  };

  T.post('direct_messages/new', dm, function(err, reply) {
    if (err) {
      console.log('   DM error:', err);
    }

    // 2016-11-28 rporczak -- Stuff this in here so that the logs
    //   are synchronous.
    napTime();
  });
};

napTime = function () {
  // 2016-11-28 rporczak -- Wait for a while before trying again.
  var waitTime = twoHoursIsh();
  var wakeTime = moment(getTime() + waitTime).format("lll");

  console.log("!! Going to sleep until " + wakeTime);
  setTimeout(theHat, waitTime);
};


theHat = function () {
  console.log("!! Waking up at " + moment().format("lll"));

  // 2016-11-30 rporczak -- Query string still searching for old name.
  //    Maybe this will change one day! Maybe not.
  T.get(
    'users/search', { "q":"TodayInGB" },
    function (err, data, response) {
      if (!exists(err) && exists(data) && exists(data[0])) {
        // 2016-11-28 rporczak -- Make sure that we get a user back!
        console.log("   Got user.");

        var screen_name = data[0].screen_name;
        var lastStatus  = data[0].status;

        if (screen_name === "ThisDayInGB" && exists(lastStatus)) {
          // 2016-11-28 rporczak -- Make sure that we found the right account,
          //   and that it has a status (err on the side of not posting over
          //   accidentally doubling up).
          console.log("   @ThisDayInGB has a most recent tweet.");

          var status_text = lastStatus.text;

          getTwitterStatus(function(data) {
            if (!exists(data.error) && exists(data.status)) {
              // 2016-11-28 rporczak -- We've generated the tweet and not
              //   thrown an error!!
              console.log("   Tweet generated, no error.");

              var tweetText = data.tweetText;
              var status    = data.status;

              if (status_text.indexOf(tweetText) === -1) {
                T.post(
                  'statuses/update', { 'status': status },
                  function (err, data, response) {
                    if (!err) {
                      // 2016-11-28 rporczak -- Success!!
                      console.log("!! Successfully posted tweet: " + status);
                      napTime();
                    } else {
                      // 2016-11-28 rporczak -- Encountered some error tweeting.
                      console.log("   Error making tweet.");
                      if (exists(err.code) && exists(err.message)) {
                        handleError(err.code + ": " + err.message);
                      } else {
                        handleError(err);
                      }
                    }
                  }
                );
              } else {
                // 2016-11-28 rporczak -- Woke up too early, our tweet is stale.
                console.log("   Woke up too early! Tweet is stale. Tweet: " + status);
                napTime();
              }
            } else if (exists(data.error)){
              // 2016-11-28 rporczak -- Error on tweet creation!! Bounce out
              //   and report.
              console.log("   Error during tweet generation!");
              handleError(data.error);
            } else {
              // 2016-11-28 rporczak -- In this case, there was no error but the
              //   tweet does not exist. This means that there was no video, which
              //   is ok!
              console.log("   There's no tweet for this time. Go to sleep.");
              napTime();
            }
          });
        } else {
          // 2016-11-28 rporczak -- Error fetching user!! Wrong one, or no status.
          console.log("   Error verifying user");

          if (screen_name !== "ThisDayInGB") {
            handleError("Got wrong user: " + screen_name);
          } else {
            handleError("No previous status!");
          }
        }
      } else {
        // 2016-11-28 rporczak -- Error fetching user!! Bounce out and report.
        console.log("   Error fetching user!");
        if (exists(err) && exists(err.code) && exists(err.message)) {
          handleError(err.code + ": " + err.message);
        } else if (exists(err)) {
          handleError(err);
        } else if (!exists(data) || !exists(data[0])) {
          handleError("@TodayInGB user query returned no results.");
        } else {
          handleError(err);
        }
      }
    }
  )
};

theHat();
