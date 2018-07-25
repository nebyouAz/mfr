(function() {
  var app, express, collections, collection, server, username, password;
  var tobeencoded, encoded, url;
  const encode = require('nodejs-base64-encode');
  var Client = require('node-rest-client').Client;

  express = require("express");

  url = "https://resourcemap.eth.instedd.org/api/";
  username = "fekaduw@gmail.com";
  password = "12345678";
  tobeencoded = username + ':' + password;
  encoded = encode.encode(tobeencoded, 'base64');
  
  var client = new Client();
 
  var args = {
    //data: { test: "hello" }, // data passed to REST method (only useful in POST, PUT or PATCH methods)
    //path: { "id": 120 }, // path substitution var
    //parameters: { arg1: "hello", arg2: "world" }, // this is serialized as URL parameters
    headers: { "Authorization": "Basic " + encoded } // request headers
  };

  // registering remote methods
  client.registerMethod("collectionMethod", url + "collections.json", "GET");

  collections = function(req, res, next) {
    console.log("Received collection request ");
    client.methods.collectionMethod(args, function (data, response) {
      //console.log(data); 
      res.send(data);
    });
    
  };

 
  app = express();

  app.use(express.json());

  app.get("/collections/", collections);

  server = app.listen(process.env.PORT || 2445, function() {
    return console.log("client-service running on port " + (server.address().port));
  });

}).call(this);
