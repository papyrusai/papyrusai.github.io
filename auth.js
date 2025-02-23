const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { MongoClient } = require('mongodb');
const uri = process.env.DB_URI;
const LocalStrategy = require('passport-local').Strategy;


//to avoid deprecation error
const mongodbOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true
  }


/*GOOGLE*/
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

/*OLD SERIALIZA --> BASED ON GOOLFE ID USER
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
*/

/*New serialize for both methods*/

passport.serializeUser((user, done) => {
  done(null, user._id.toString());
});

passport.deserializeUser(async (id, done) => {
  const { ObjectId } = require('mongodb');
  const client = new MongoClient(uri, mongodbOptions);
  try {
    await client.connect();
    const database = client.db("papyrus");
    const usersCollection = database.collection("users");
    const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    done(null, user);
  } catch (err) {
    done(err);
  } finally {
    await client.close();
  }
});


/*MAIL*/
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    // Import bcrypt for comparing hashed passwords
    const bcrypt = require('bcryptjs');
    const client = new MongoClient(uri, mongodbOptions);
    try {
      await client.connect();
      const database = client.db("papyrus");
      const usersCollection = database.collection("users");

      // Find user by email
      const user = await usersCollection.findOne({ email: email });
      if (!user) {
        return done(null, false, { message: 'Incorrect email.' });
      }

      // Compare submitted password with stored hash
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    } finally {
      await client.close();
    }
  }
));
