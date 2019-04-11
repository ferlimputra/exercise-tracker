const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const mongoose = require('mongoose')
const uuidv4 = require('uuid/v4')
require('mongoose-uuid2')(mongoose);
const UUID = mongoose.Types.UUID;

const port = process.env.PORT || 3000;

mongoose.connect(
  process.env.MONGO_URI || 'mongodb://localhost/exercise-track',
  { useNewUrlParser: true }
);
const db = mongoose.connection;
db.on('error', console.error.bind(console, "Failed to connect"));
db.once('open', () => {
  console.log("Connected to Mongo");
});

// Schema 
const UserSchema = new mongoose.Schema({
  user_id: { type: UUID, default: uuidv4 },
  username: String
}, { id: false });
UserSchema.set('toObject', { getters: true });
UserSchema.set('toJSON', { getters: true });
const User = mongoose.model("User", UserSchema);

const ExerciseSchema = new mongoose.Schema({
  user_id: UUID,
  description: String,
  duration: Number,
  date: Date
});
ExerciseSchema.set('toObject', { getters: true });
ExerciseSchema.set('toJSON', { getters: true });
const Exercise = mongoose.model("Exercise", ExerciseSchema);

// Express setup
const app = express()
app.use(cors())
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
app.use(express.static('public'))
app.use('/public', express.static(process.cwd() + '/public'));
app.use("/", bodyParser.urlencoded({
  extended: false
}));

// Business logic
const getUserByUserId = (userId, next) => {
  User.find({ user_id: userId }, (err, data) => {
    if (err) {
      next(err);
    }
    next(null, data);
  });
}

const getUserByUsername = (username, next) => {
  User.find({ username: username }, (err, data) => {
    if (err) {
      next(err);
    }
    next(null, data);
  });
};

const getExercises = (logParams, next) => {
  console.log("Searching exercises with param: ");
  console.log(logParams);
  
  const exerciseQuery = {
    user_id: logParams.userId
  };
  const exerciseQueryOptions = {
    limit: parseInt(logParams.limit)
  };
  
  if (logParams.from) {
    if (!exerciseQuery.date) {
      exerciseQuery.date = {};
    }
    exerciseQuery.date.$gte = logParams.from;
  } else if (logParams.to) {
    if (!exerciseQuery.date) {
      exerciseQuery.date = {};
    }
    exerciseQuery.date.$lte = logParams.to;
  }
  
  Exercise.find(exerciseQuery, null, exerciseQueryOptions, (err, exercises) => {
    if (err) {
      next(err);
    }
    next(null, exercises);
  });
};

const checkExistingUsername = (username, next) => {
  console.log("Checking duplicate username...");
  getUserByUsername(username, (err, data) => {
    if (err) {
      next(err);
    } else if (data && data.length) {
      console.log("Username already exists");
      next(new Error("Username already exists"));
    } else {
      next(null);
    }
  });
};

const saveNewUser = (username, next) => {
  console.log("Saving new user...");
  const newUser = new User({ username: username });
  newUser.save((err, newUser) => {
    if (err) {
      next(err);
    } else {
      console.log("User saved successfully");
      next(null, newUser);
    }
  });
};

const processingNewUser = (username, res) => {
  checkExistingUsername(username, (err) => {
    if (err) {
      res.json({
        error: err
      });
    } else {
      saveNewUser(username, (err, data) => {
        if (err) {
          res.json({
            error: err
          });
        } else {
          res.json(data);
        }
      });
    }
  });
};

const saveNewExercise = (exerciseData, next) => {
  console.log("Saving new exercise...");
  const exercise = new Exercise(exerciseData);
  exercise.save((err, exercise) => {
    if (err) {
      next(err);
    } else {
      console.log("Exercise saved successfully");
      next(null, exercise);
    }
  });
};

const processingNewExercise = (exerciseData, res) => {
  console.log("Checking for user...");
  getUserByUserId(exerciseData.user_id, (err, user) => {
    if (err) {
      res.json({
        error: err
      });
    } else if (!user || !user.length) {
      res.json({
        error: new Error("User not found.")
      });
    } else {
      saveNewExercise(exerciseData, (err, data) => {
        if (err) {
          res.json({
            error: err
          });
        } else {
          res.json(data);
        }
      });
    }
  });
};

const processingLog = (logParams, res) => {
  if (!logParams.userId) {
    res.json({
      error: new Error("UserId is not provided.")
    });
  } else {
    getUserByUserId(logParams.userId, (err, user) => {
      if (err) {
        res.json({
          error: err
        });
      } else if (!user || !user.length) {
        res.json({
          error: new Error("User not found.")
        });
      } else {
        getExercises(logParams, (err, exercises) => {
          if (err) {
            res.json({
              error: err
            });
          } else {
            res.json(exercises);
          }
        });
      }
    });
  }
};

//Routing
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

app.get('/api/exercise', (req, res) => {
  const username = req.query.username;
  getUserByUsername(username, (err, data) => {
    if (err) {
      res.json({
        error: err
      });
    } else {
      res.json(data);
    }
  });
});

app.get("/api/exercise/log", (req, res) => {
  const logParams = {
    userId: req.query.userId,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit
  };
  processingLog(logParams, res);
});

app.post('/api/exercise/new-user', (req, res) => {
  const username = req.body.username;
  processingNewUser(username, res);
});

app.post('/api/exercise/add', (req, res) => {
  const exerciseData = {
    user_id: req.body.userId,
    description: req.body.description,
    duration: req.body.duration,
    date: req.body.date
  };
  processingNewExercise(exerciseData, res);
});

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(port, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
