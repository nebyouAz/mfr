#!/usr/bin/env node
'use strict'

const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')

const utils = require('./utils')
//var Client = require('node-rest-client').Client;
const fetch = require('node-fetch');
// Logging setup
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'info', timestamp: true, colorize: true})

// Config
let config = {} // this will vary depending on whats set in openhim-core
const apiConf = process.env.NODE_ENV === 'test' ? require('../config/test') : require('../config/config')
const mediatorConfig = require('../config/mediator')

let port = process.env.NODE_ENV === 'test' ? 7001 : mediatorConfig.endpoints[0].port

/**
 * setupApp - configures the http server for this mediator
 *
 * @return {express.App}  the configured http server
 */
function setupApp () {
  const app = express()

  app.all('*', async (req, res) => {
    winston.info(`Processing ${req.method} request on ${req.url}`)
    var collection_req = '/api/collections';
    var site_req = '/api/sites';
    var organisationUnit_req = '/api/organisationUnits';
    var headers = { 'content-type': 'application/json' };

    //What i have added
    var encoded = utils.doencode();
    var encodedDHIS2 = utils.doencodeDHIS2();

 
    //see the encoded and url from mediator config
    console.log(encoded);
    console.log(mediatorConfig.config.baseurl);

    var collections_data = await fetch(mediatorConfig.config.baseurl + collection_req, {
      method: "GET",
      headers: {
        "Authorization":"Basic " + encoded
      }
    });
    var collections = await collections_data.json();
    var responseBody = JSON.stringify(collections);
    
    // capture orchestration data
    var orchestrationResponse = { statusCode: 200, headers: headers }
    let orchestrations = []
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, 
                        req.body, orchestrationResponse, responseBody))
    
    var collection_id;
    //As there may be more than one collection info
    //We need to see which one to pick for the ID. Lets assume the one
    //with the name 'Ethiopia Health Facility Registry' is required to be used
    
    for(var collection of collections) {
      var collection_name = collection.name;
      if(collection_name == mediatorConfig.config.collectionname) {
        collection_id = collection.id;
        break;
      }    
    }
    console.log("Collection ID: " + collection_id);

    //Fetch site detail
    var site_detail = await fetch(mediatorConfig.config.baseurl + site_req + '/' + 
                                  mediatorConfig.config.siteidtosync + '.json', {
      method: "GET",
      headers: {
        "Authorization":"Basic " + encoded
      }
    });
    var sites = await site_detail.json();
    
    var organisationUnit = {"name":sites.name, 
                            "openingDate": sites.properties.year_opened ? sites.properties.year_opened : '1980-01-01',
                            "shortName": sites.properties.specific_area_name, 
                            "id": sites.properties.Admin_health_hierarchy,
                            "parent":{
                              "id":"cawmPT9A1Gg"
                            }
                          };
                            
    console.log(mediatorConfig.config.DHIS2baseurl + organisationUnit_req);
    console.log(JSON.stringify(organisationUnit));
    var return_data;

    orchestrationResponse = { statusCode: 200, headers: headers }
    orchestrations.push(utils.buildOrchestration('Fetch specific site and do data transformation', new Date().getTime(), 
                          '', '', '', '', orchestrationResponse, JSON.stringify(organisationUnit)))


    //Add new Organisation Unit
    var insert_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req, {
      method: "POST",
      headers: {
        "Authorization":"Basic " + encodedDHIS2,
        "Content-Type":"application/json"
      },
      body: JSON.stringify(organisationUnit)
      
    })
    .then(response => response.json())
    .then(function handleData(data) {
      return_data = data;
    });



    responseBody = JSON.stringify(return_data);
    console.log(responseBody);
   
    orchestrations.push(utils.buildOrchestration('Register in DHIS2', new Date().getTime(), req.method, req.url, 
                        req.headers, req.body, orchestrationResponse, responseBody))

    // set content type header so that OpenHIM knows how to handle the response
    res.set('Content-Type', 'application/json+openhim')

    // construct return object
    var properties = { property: 'Primary Route' }
    res.send(utils.buildReturnObject(mediatorConfig.urn, 'Successful', 200, headers, responseBody, orchestrations, properties))
  })
  return app
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start (callback) {
  if (apiConf.api.trustSelfSigned) { process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' }

  if (apiConf.register) {
    medUtils.registerMediator(apiConf.api, mediatorConfig, (err) => {
      if (err) {
        winston.error('Failed to register this mediator, check your config')
        winston.error(err.stack)
        process.exit(1)
      }
      apiConf.api.urn = mediatorConfig.urn
      medUtils.fetchConfig(apiConf.api, (err, newConfig) => {
        winston.info('Received initial config:')
        winston.info(JSON.stringify(newConfig))
        config = newConfig
        if (err) {
          winston.error('Failed to fetch initial config')
          winston.error(err.stack)
          process.exit(1)
        } else {
          winston.info('Successfully registered mediator!')
          let app = setupApp()
          const server = app.listen(port, () => {
            if (apiConf.heartbeat) {
              let configEmitter = medUtils.activateHeartbeat(apiConf.api)
              configEmitter.on('config', (newConfig) => {
                winston.info('Received updated config:')
                winston.info(JSON.stringify(newConfig))
                // set new config for mediator
                config = newConfig

                // we can act on the new config received from the OpenHIM here
                winston.info(config)
              })
            }
            callback(server)
          })
        }
      })
    })
  } else {
    // default to config from mediator registration
    config = mediatorConfig.config
    let app = setupApp()
    const server = app.listen(port, () => callback(server))
  }
}
exports.start = start

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => winston.info(`Listening on ${port}...`))
}
