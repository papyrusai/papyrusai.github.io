const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { MongoClient } = require('mongodb');
const uri = process.env.DB_URI;

//to avoid deprecation error
const mongodbOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true
  }

async function upsertUser(profile) {
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = {
      googleId: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value
    };

    const result = await usersCollection.updateOne(
      { googleId: user.googleId },
      { $set: user },
      { upsert: true }
    );

    console.log(`User ${result.upsertedId ? 'inserted' : 'updated'}`);
    return user;
  } finally {
    await client.close();
  }
}

async function findUserByGoogleId(googleId) {
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");

    const user = await usersCollection.findOne({ googleId: googleId });
    return user;
  } finally {
    await client.close();
  }
}

passport.use(new GoogleStrategy({
  
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://app.papyrus-ai.com/auth/google/callback'
},
async (token, tokenSecret, profile, done) => {
  try {
    const user = await upsertUser(profile);
    done(null, user);
  } catch (err) {
    done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.googleId);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUserByGoogleId(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});
