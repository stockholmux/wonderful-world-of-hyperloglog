var
  bodyParser      = require('body-parser'),             //`body-parser` allows express to read POST data
  crypto          = require('crypto'),                  //`crypto` will let us generate MD5s
  express         = require('express'),                 //`express` is a server framework
  redis           = require('redis'),                   //`redis` is the library to connect to the redis server
  rk              = require('rk'),                      //`rk` is a micro module that joins keys together redis-style (with ':')
  yargs           = require('yargs')                    //`yargs` gets command line arguments
    .demand('credentials')
    .argv,
  
  connectionJson  = require(yargs.credentials),         //we will accept the argument '--credentials' this points to a JSON file with the your redis connection information
  client          = redis.createClient(connectionJson), //create the client with the imported redis connection info
  app;                                                  //what will become our server

app = express();                                        //Create the instance of the express server

function checkin(email,location,cb) {                   //checkin accepts an email of the user, the location key and a callback. This is really just to organize the code a little better
  client.pfadd(                                         //`pfadd` adds something to the hyperloglog
    rk('location',location),                            //This will produce a redis key like: 'location:my-location-key'
    crypto.createHash('md5')                            //Make an empty MD5 hash
      .update(email)                                    //Update it with the email string
      .digest('hex'),                                   //Produce the traditional MD5 hex representation.
    cb                                                  //Callback when the redis pfadd command is completed.
  );
}

                                                        //This is a good place to talk about why I'm using MD5s here. MD5s are no-go for cryptographic purposes but they are still a decent way of just hashing for uniqueness. In our example, we're simulation a user ID, which would be a fine use of MD5

function getCheckinCount(location,cb) {                 //accept a location and get a count
  client.pfcount(                                       //`pfcount` returns the count in a hyperloglog
    rk('location',location),                            //This will produce a redis key like: 'location:my-location-key'
    cb                                                  //Callback when the redis pfcount command is completed.
  );
}

function locationExistsMiddleware(req,res,next) {       //Middleware to ensure that the location exists
  client.sismember(                                     //`sismember` check if a value is a member of a particular set
    'locations',                                        //'locations' is where we are storing the valid locations
    req.params.location,                                //`req.params.location` grabs the location from the route parameters
    function(err,exists) {                              //`exists` returns 0 if not found, 1 if found in set
      if (err) { next(err); } else {                    //Pass the err, if one exists, back to Express and return an http error code and trace
        if (exists === 0) {                             //If we have a 0 return from our redis command
          res.status(404).end();                        //then we give a not found and end the http here - it doesn't pass on to the next function in the routing stack
        } else {
          next();                                       //`sismember` if not an error, only returns a 0 or 1. Since we've handled errors and '0' then we can assume `req.params.location` is a member of 'locations' and is thus valid
        }
      }
    }
  );
}

function getLocationData(req,res,next) {                //Get the location data - aka the count, in this case.
  getCheckinCount(                                      
    req.params.location,                                //`req.params.location` grabs the location from the route parameters
    function(err,uniqueCheckIns) {
      if (err) { next(err); } else {                    //Pass the err, if one exists, back to Express and return an http error code and trace 
        res.send({                                      //Since we are passing a JS object to the `res.send` express will send a JSON-formatted version back over HTTP
          checkIns : uniqueCheckIns                     //It'll look something like `{ checkIns : 45 }`
        });
      }
    }
  );
}


app.put(                                                //Respond only to the HTTP verb 'put'
  '/location/:location',                                //The colon (':') represents a parameter that will be passed into the `req.params` object
  bodyParser.json(),                                    //Since this example uses Angular, the default behavior for Angular is to pass JSON objects in the body of AJAX calls. It handles this type of parsing for us.
  locationExistsMiddleware,                             //Call our middleware to make sure we don't get any non-valid locations         
  function(req,res,next) {
    checkin(                                            //Checkin the user with the data from the body of the PUT request
      req.body.email,                                   //In the PUT request { ... email : 'example@example.com'}
      req.params.location,                              //In the PUT request { ... location : 'mylocation'}
      function(err) {
        if (err) { next(err); } else {                  //Pass the err, if one exists, back to Express and return an http error code and trace 
          next();                                       //This is built as a middleware, if everything is ok, then we pass it along to the next function (getLocationData)
        }
      }
    );
  },
  getLocationData                                       //We always end valid requests with the location data
);

app.get(                                                //Respond only to the HTTP verb 'get'
  '/location/:location',                                //The colon (':') represents a parameter that will be passed into the `req.params` object
  locationExistsMiddleware,                             //Call the middleware
  getLocationData                                       //If the middleware didn't reject the request, then get the location data
);

app.get(                                                //Respond only to the HTTP verb 'get'
  '/locations',
  function(req,res,next) {
    client.smembers(                                    //Redis call to the command SMEMBERS
      'locations',                                      //At the key 'locations'
      function(err, locations) {
        if (err) { next(err); } else {                  //Pass the err, if one exists, back to Express and return an http error code and trace 
          res.send({
            locations : locations
          });                                           //Send a JSON object like { locations : [ 'aLocation', 'anotherLocation' ]}
        }
      }
    );
  }
);

app.get(                                                //Respond only to the HTTP verb 'get'
  '/multi-location/:locations',                         //The colon (':') represents a parameter that will be passed into the `req.params` object - in this case the location keys joined with a '+'
  function(req,res,next) {
    var
      locations = req.params.locations.split('+');      //Split up the locations parameter from the route by the '+'
    
    locations = locations.map(function(aLocation) {
      return rk('location',aLocation);                  //each location in the `locations` array gets 'location:' prepended to it
    });
    client.pfcount(locations,function(err,total) {      //when we pass in the array to node_redis, each element is assigned as a seperate argument in redis. With the pfcount command, having multiple arguments will produce a union of all the items passed in
      if (err) { next(err); } else {                    //Pass the err, if one exists, back to Express and return an http error code and trace 
        res.send({
          total   : total
        });                                             //Send a JSON object like { total : 1001 }
      }
    });
  }
);


app
  .use(express.static('public'))                        //Allows for the serving of the static files in the 'public' directory
  .listen(8013, function() {                            //Web server listens on port 8013
    console.log('app started');                         //Log to the console that our server is up and running.
  });
