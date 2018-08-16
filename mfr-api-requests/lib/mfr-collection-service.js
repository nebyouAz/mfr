(function() {
  var app, express, collections, collection, server;
  var encoded;
  
  var util = require('./util.js');
  var Client = require('node-rest-client').Client;

  express = require("express");

  encoded = util.doencode();
  
  var client = new Client();
 
  var args = {
    //data: { test: "hello" }, // data passed to REST method (only useful in POST, PUT or PATCH methods)
    //path: { "id": 120 }, // path substitution var
    //parameters: { arg1: "hello", arg2: "world" }, // this is serialized as URL parameters
    headers: { "Authorization": "Basic " + encoded } // request headers
  };

  // registering remote methods
  client.registerMethod("collectionMethod", util.url + "collections.json", "GET");

  collections = function(req, res, next) {
    console.log("Received collections request ");
    client.methods.collectionMethod(args, function (data, response) {
      res.send(data);
    });
    
  };

  siteslist = function(req, res, next) {
    var id = req.params.id;
    console.log("Received sites list in a collection request ");
    client.get(util.url + "collections/" + id + ".json", args, function (data, response) {
      res.send(data);
    });
  };
 
  specificsite = function(req, res, next) {
    var id = req.params.id;
    console.log("Received site request ");
    client.get(util.url + "sites/" + id + ".json", args, function (data, response) {
      res.send(data);
    });
  };

  app = express();

  app.use(express.json());

  app.get("/collections/", collections);
  app.get("/collections/:id", siteslist);
  app.get("/sites/:id", specificsite);

  server = app.listen(process.env.PORT || 2445, function() {
    return console.log("client-service running on port " + (server.address().port));
  });

}).call(this);
