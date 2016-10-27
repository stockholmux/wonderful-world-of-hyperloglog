angular
  .module(
    'hllCheckin',                                                             //create and name the module
    []                                                                        //no other angular modules to include
  )
  .controller('HllCheckInCtrl', function($scope,$http,$q) {                   //This is the main and only controller
    var
      user,                                                                   //We'll be 'simulating' a user login with a controller-scoped variable
      updateCheckIns;


    $scope.login = function() {
      user = $scope.userEmail;                                                //"login" is only accepting the user's email address
      $scope.loggedIn = true;                                                 //and flipping the loggedIn to true
    };

    updateCheckIns = function(location) {                                     //Closing over the `location`
      return function(response){                                              //This is a promise-response handler
        if (!$scope.locationsCheckins[location]) {
          $scope.locationsCheckins[location] = {};                            //Create the location in `$scope.locationsCheckins` if needed
        }

        $scope.locationsCheckins[location].checkins = response.data.checkIns; //Set the number of checkins from the response data
        if (response.config.data) {                                           //We're using the same handler for both just getting the count and for a check-in. This part will only be used on checkin.
          $scope.checkins.push(response.config.data);                         //Push the data into the array
          $scope.checkins = $scope.checkins.slice(-10);                       //Trim it out so we only keep the 10 most recent
        }
        return response;                                                      //Return the response should we need to do chaining later on
      };
    };

    $scope.setLocation = function(location) {
      $scope.currentLocation = location;                                      //Set the current location to the passed argument by ng-click
      $http.get(                                                              //Get the current location's count
        '/location/'+$scope.currentLocation
      ).then(updateCheckIns(location));                                       //Use our multi-purpose handler
    };

    $scope.fakeEmail = function() {
      $scope.userEmail = faker.internet.email();                              //generate a fake, yet valid email address for login
      $scope.signInForm.userEmail.$setDirty();                                //We're using ng-disabled and checking for pristine/dirty to get the right UX. We have to do it manually since we're programmatically setting a bound text box.
    };

    $scope.checkIn = function(location,email) {                               //Checkin a user at a location
      return $http.put(                                                       //use HTTP PUT
        '/location/'+location,                                                //the location is passed in from the template through the function by ng-click
        {
          email       : email,                                                //email is passed the same way
          location    : location
        }
      ).then(updateCheckIns(location));                                       //Our multi-purpose handler again
    };

    $scope.randomCheckIn = function(numberOfCheckins, location) {             //`numberOfCheckins` could be any value but our template is passing 10, 50 or 100
      var
        i,
        checkins    = [];

      for (i = 0; i < numberOfCheckins; i += 1) {
        checkins.push( $scope.checkIn(location,faker.internet.email()) );     //`$scope.checkIn` returns a promise, so our `checkins` array is getting populated by promises
      }

      $q.all(                                                                 //`$q.all` will resolve after all the promises in checkins have finished
        checkins
      ).then(function() { console.log('done with batch!'); });                  //You could do something more interesting here, but it's not needed for this demonstration
    };

    $scope.multiCount = function() {                                          //count the total of multiple locations
      var
        locationsToCount;

      locationsToCount = Object.keys($scope.countLocations)                   //We have an object like this { "epcot" : true, "animal-kingdom" : false } and we're using Object.keys to make iteration easy.
        .filter(function(aLocationKey) {                                      //Filter will remove any array items that don't evaluate truthy
          return $scope.countLocations[aLocationKey];
        });

      if (locationsToCount.length === 0) {                                    //Nothing in the locations?
        $scope.combinedCount = undefined;                                     //clear combinedCount which will also clear the template results
      } else {
        $http.get(                                                            //Send an HTTP GET request
          '/multi-location/'+locationsToCount.join('+')                       //take the locations array items and join them with "+" - it will look like '/multi-location/locationa+locationb+locationc'
        ).then(function(response) {
          $scope.combinedCount = {                                            //store all this in the $scope.combinedCount variable
            total     : response.data.total,                                  //Angular puts the actual JSON response in the `data` attribute of `response`
            locations : locationsToCount                                      //set the locations to our template
          };
        });
      }
    };
  
    $scope.countLocations = {};                                               //Set the initial state of our template variables
    $scope.locationsCheckins = {};
    $scope.checkins = [];
    $scope.loggedIn = false;
    
    $http.get(                                                                //Get the valid locations
      '/locations'
    ).then(function(response){
      $scope.locations = response.data.locations;                             //make it available to the template
    });
  });