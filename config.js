var gbAPIKey = process.env.GB_API_KEY;

var twitterKeys = {
  access_token:         process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret:  process.env.TWITTER_ACCESS_TOKEN_SECRET,
  consumer_key:         process.env.TWITTER_CONSUMER_KEY,
  consumer_secret:      process.env.TWITTER_CONSUMER_SECRET
};

module.exports = {
  gb:       gbAPIKey,
  twitter:  twitterKeys
};
