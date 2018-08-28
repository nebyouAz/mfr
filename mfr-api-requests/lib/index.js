#!/usr/bin/env node
'use strict'

const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')
const data_tree = require('data-tree')
const utils = require('./utils')
const fs = require('fs')
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
    var collection_req = '/api/collections'
    var site_req = '/api/sites'
    var layer_req = '/fields.json'
    var organisationUnit_req = '/api/organisationUnits'
    var organisationUnitRegister_req = '/api/metadata?identifier=code&importStrategy=CREATE_AND_UPDATE'
    var organisationUnitSearch_req = '?filter=name:eq:';
    var last_added = '/last_added'
    var headers = { 'content-type': 'application/json' }

    //What i have added
    var encoded = utils.doencode()
    var encodedDHIS2 = utils.doencodeDHIS2()

 
    //see the encoded and url from mediator config
    console.log(encoded);
    console.log(mediatorConfig.config.baseurl);

    let orchestrations = []
    let lastAdded
    try {
      lastAdded = await fs.readFileSync(__dirname + last_added, 'utf8')
    } catch (err) {
      lastAdded = err.message
      const headers = { 'content-type': 'application/text' }

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, lastAdded, orchestrations, properties))
      return
    }


  /*****************************************
      FETCH COLLECTION INFORMATION
      Connects to MFR API for collections
  ******************************************/

   
   let mfrCollectionsResponseBody
   let collections_data

    try{
      collections_data = await fetch(mediatorConfig.config.baseurl + collection_req, {
        method: "GET",
        headers: {
          "Authorization":"Basic " + encoded
        }
      });
    } catch (err) {
      mfrCollectionsResponseBody = err.message
      const headers = { 'content-type': 'application/text' }

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, mfrCollectionsResponseBody, 
                orchestrations, properties))
      return
    }

    var collections = await collections_data.json();
    //console.log(collections);
    if (typeof collections.error !== 'undefined') {
      mfrCollectionsResponseBody = collections.error;
      const headers = { 'content-type': 'application/text' }

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, mfrCollectionsResponseBody, 
                orchestrations, properties))
      return
    }
    
    var responseBody = JSON.stringify(collections)
    
    // capture orchestration data
    var orchestrationResponse = { statusCode: 200, headers: headers }
    //let orchestrations = []
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, 
                        req.body, orchestrationResponse, responseBody))


    var collection_id
    //As there may be more than one collection info
    //We need to see which one to pick for the ID. Lets assume the one
    //with the name 'Ethiopia Health Facility Registry' is required to be used
    
    for(var collection of collections) {
      var collection_name = collection.name
      if(collection_name == mediatorConfig.config.collectionname) {
        collection_id = collection.id
        break
      }    
    }
    console.log("Collection ID: " + collection_id)

    /******************************************
        FETCH SITE DETAIL INFORMATION
        Connects to MFR API for site detail
    *******************************************/
    
    let mfrSiteDetailResponseBody
    try{
      //Fetch site detail
      var site_detail = await fetch(mediatorConfig.config.baseurl + collection_req + '/' + 
                                      collection_id + '.json' + '?created_since=' + lastAdded + 
                                      '&page=50', {
        method: "GET",
        headers: {
          "Authorization":"Basic " + encoded
        }
      });
    } catch (err) {
      mfrSiteDetailResponseBody = err.message
      const headers = { 'content-type': 'application/text' }

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, mfrSiteDetailResponseBody, 
                orchestrations, properties))
      return
    }

    var sites = await site_detail.json();
    console.log("============URL==========" + mediatorConfig.config.baseurl + collection_req + '/' + 
    collection_id + '.json' + '?created_since=' + lastAdded + 
    '&page=10');
    console.log("==============Sites===========" + sites.sites)
    if (typeof sites.error !== 'undefined') {
      mfrSiteDetailResponseBody = sites.error;
      const headers = { 'content-type': 'application/text' }

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, mfrSiteDetailResponseBody, 
                orchestrations, properties))
      return
    }

    var responseBody = JSON.stringify(sites)
    
    // capture orchestration data
    var orchestrationResponse = { statusCode: 200, headers: headers }
    //let orchestrations = []
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, 
                        req.body, orchestrationResponse, responseBody))


    /**************************************
         FETCH LAYER INFORMATION
         Connects to MFR API for layers
    ***************************************/

    let mfrLayersResponseBody
    try{
      //Fetch layer detail
      var layer_detail = await fetch(mediatorConfig.config.baseurl + collection_req + '/' + 
                                    collection_id + layer_req, {
        method: "GET",
        headers: {
          "Authorization":"Basic " + encoded
        }
      })
    } catch (err) {
      mfrLayersResponseBody = err.message
      const headers = { 'content-type': 'application/text' }

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, mfrLayersResponseBody, 
                orchestrations, properties))
      return
    }

    var layer = await layer_detail.json();
    if (typeof layer.error !== 'undefined') {
      mfrLayersResponseBody = layer.error;
      const headers = { 'content-type': 'application/text' }

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, mfrLayersResponseBody, 
                orchestrations, properties))
      return
    }

    var responseBody = JSON.stringify(layer)
    
    // capture orchestration data
    var orchestrationResponse = { statusCode: 200, headers: headers }
    //let orchestrations = []
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, 
                        req.body, orchestrationResponse, responseBody))
    
    /*****************************************
         BUILD TREE FOR THE LAYER HIERARCHY
         use data-tree npm
    ******************************************/
    
    let hierarchy
    for(var layer_element of layer) {
      if(layer_element.id == 45) {
        var layer_fields = layer_element.fields
        for(var layer_field of layer_fields) {
          if(layer_field.id == 26) {
            hierarchy = layer_field.config.hierarchy
            break
          }
        }
      }    
    }

    var tree = dataTree.create()
    var hierarchy_entry = hierarchy[0];
    var rootNode = tree.insert({
      key: hierarchy_entry.id,
      value: {name: hierarchy_entry.name}
    })
    console.log(hierarchy_entry.sub.length)
    for(var i = 0; i< hierarchy_entry.sub.length; i++) {
      var sub = hierarchy_entry.sub[i];
      var subNode = tree.insertToNode(rootNode, {
        key: sub.id,
        value: {name: sub.name}
      })
      for(var j = 0; j < sub.sub.length; j++) {
        var sub_sub = sub.sub[j]
        var subSubNode = tree.insertToNode(subNode, {
          key: sub_sub.id,
          value: {name: sub_sub.name}
        })
        if(sub_sub.sub) {
          for(var k = 0; k < sub_sub.sub.length; k++) {
            var sub_sub_sub = sub_sub.sub[k]
            var subSubSubNode = tree.insertToNode(subSubNode, {
              key: sub_sub_sub.id,
              value: {name: sub_sub_sub.name}
            })
          }
        }
      }
    }
    
    let organisationUnits = []
    for(var n = 0; n < sites.sites.length; n++) {
      var node = tree.traverser().searchBFS(function(data){
        return data.key === sites.sites[n].properties.Admin_health_hierarchy;
      });

      let parents = []
      while(node) {
        parents.push ({
          "name": node._data.value.name,
          "openingDate": '1980-06-15',
          "shortName": node._data.value.name.substring(0, 49),
        })
        node = node._parentNode
      }

      let parent_id
      for(var i = parents.length - 1; i >= 0; i--) {
        console.log(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
          organisationUnitSearch_req + parents[i].name)
        //Fetch organisation unit information
        var ou_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                                      organisationUnitSearch_req + parents[i].name, {
          method: "GET",
          headers: {
            "Authorization":"Basic " + encodedDHIS2
          }
        })
        .then(response => response.json())
        .then(function handleData(data) {
          return_data = data;
        })
        //console.log(return_data.organisationUnits[0].id)
        
        //var ou = await ou_detail.json();
        
        if(return_data.organisationUnits.length > 0) {
          parent_id = return_data.organisationUnits[0].id
          //break
        } else {
          if(i == parents.length - 1) {
            var parentOrganisationUnit = {
              "name": parents[i].name, 
              "openingDate": '1980-06-15',
              "shortName": parents[i].name.substring(0, 49),        
            }
          } else {
            var parentOrganisationUnit = {
              "name": parents[i].name, 
              "openingDate": '1980-06-15',
              "shortName": parents[i].name.substring(0, 49),
              "parent":{
                "id": parent_id
              }
            }
          }
          
          //Add new parent Organisation Unit
          var insert_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req, {
            method: "POST",
            headers: {
              "Authorization":"Basic " + encodedDHIS2,
              "Content-Type":"application/json"
            },
            body: JSON.stringify(parentOrganisationUnit)
            
          })
          .then(response => response.json())
          .then(function handleData(data) {
            return_data = data;
          })
          //console.log(return_data.response.errorReports)
          //responseBody = JSON.stringify(return_data);
          if(return_data.response.uid) {
            parent_id = return_data.response.uid
          }

        }
      }
      
      console.log("==================Parent ID==============: " + parent_id)
      //console.log("The heirarchy value: " + sites[n].properties.Admin_health_hierarchy)

      if(parent_id) {
        var organisationUnit = {
              "name":sites.sites[n].name, 
              "openingDate": sites.sites[n].properties.year_opened ? sites.sites[n].properties.year_opened : '1980-06-15',
              "shortName": sites.sites[n].properties.short_name ? sites.sites[n].properties.short_name : sites.sites[n].name.substring(0, 49), 
              "latitude": sites.sites[n].lat,
              "longitude": sites.sites[n].long,
              "code": sites.sites[n].properties.ethiopian_national_identifier,
              "phoneNumber": sites.sites[n].facility__official_phone_number,
              "parent":{
                "id": parent_id
              }
        }
      } else {
        var organisationUnit = {
          "name":sites.sites[n].name, 
          "openingDate": sites.sites[n].properties.year_opened ? sites.sites[n].properties.year_opened : '1980-06-15',
          "shortName": sites.sites[n].properties.short_name ? sites.sites[n].properties.short_name : sites.sites[n].name.substring(0, 49), 
          "latitude": sites.sites[n].lat,
          "longitude": sites.sites[n].long,
          "code": sites.sites[n].properties.ethiopian_national_identifier,
          "phoneNumber": sites.sites[n].facility__official_phone_number
        
        }
      }
      organisationUnits.push(organisationUnit)

      console.log(mediatorConfig.config.DHIS2baseurl + organisationUnit_req)
      console.log(JSON.stringify(organisationUnit))
      var return_data

      orchestrationResponse = { /*statusCode: 200, headers: headers*/ }
      orchestrations.push(utils.buildOrchestration('Fetch specific site and do data transformation', new Date().getTime(), 
                            '', '', '', '', orchestrationResponse, JSON.stringify(organisationUnit)))
    }  

    console.log("================Organisation Units=============" + organisationUnits)
    
    const dhisImport = {
      "organisationUnits": organisationUnits
    }
    
    //Add new Organisation Units
    var insert_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnitRegister_req, {
      method: "POST",
      headers: {
        "Authorization":"Basic " + encodedDHIS2,
        "Content-Type":"application/json"
      },
      body: JSON.stringify(dhisImport)
      
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
    res.send(utils.buildReturnObject(mediatorConfig.urn, 'Successful', 200, headers, responseBody, 
                                      orchestrations, properties))
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
