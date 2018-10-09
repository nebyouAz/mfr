#!/usr/bin/env node
'use strict'

const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')
const data_tree = require('data-tree')
const utils = require('./utils')
const fs = require('fs')
const fetch = require('node-fetch');
const date = require('date-and-time');

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
    var organisationUnitRegister_req = '/api/metadata?identifier=AUTO&importStrategy=CREATE_AND_UPDATE'
    var organisationUnitUpdate_req = '/api/metadata?identifier=AUTO&importStrategy=UPDATE'
    var organisationUnitSearch_req = '?filter=name:eq:'
    var organisationUnitSearch_req_parent = '&filter=parent.id:eq:'
    var organisationUnitSearch_req_code = '?filter=code:eq:'
    var last_added = '/last_added'
    var last_updated = '/last_updated'
    var headers = { 'content-type': 'application/json' }

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
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, lastAdded, 
                  orchestrations, properties))
      return
    }

    let lastUpdated
    try {
      lastUpdated = await fs.readFileSync(__dirname + last_updated, 'utf8')
    } catch (err) {
      lastUpdated = err.message
      const headers = { 'content-type': 'application/text' }

      // set content type header so that OpenHIM knows how to handle the response
      res.set('Content-Type', 'application/json+openhim')

      // construct return object
      res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, lastUpdated, 
                orchestrations, properties))
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
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, 
                      req.url, req.headers, req.body, orchestrationResponse, responseBody))


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

    responseBody = JSON.stringify(layer)
    
    // capture orchestration data
    var orchestrationResponse = { statusCode: 200, headers: headers }
    //let orchestrations = []
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, 
                      req.url, req.headers, req.body, orchestrationResponse, responseBody))
    
      
  /*****************************************
    BUILD TREE FOR THE LAYER HIERARCHY
    use data-tree npm
  ******************************************/
    
    let hierarchy
    for(var layer_element of layer) {
      if(layer_element.name == 'General Information of the Facility') {
        var layer_fields = layer_element.fields
        for(var layer_field of layer_fields) {
          if(layer_field.name == 'Administrative Health Hierarchy') {
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
    //console.log(hierarchy_entry.sub.length)
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

    responseBody = "Tree Structure Generated!"
    
    // capture orchestration data
    var orchestrationResponse = { statusCode: 200, headers: headers }
    //let orchestrations = []
    orchestrations.push(utils.buildOrchestration('MFR Hierarchy', new Date().getTime(), req.method, 
                      req.url, req.headers, req.body, orchestrationResponse, responseBody))
    

    /*****************************************
      SYNC THE MFR HIERARCHY WITH DHIS2
      use data-tree npm and the already 
      constructed tree structure
    ******************************************/

    let return_data
    //var i = 0;
    
    tree.traverser().traverseBFS(async function(node){
      var nodeToInsert = null
      var nodeKey = node.data().key
      var nodeName = node.data().value.name
      var parentKey = node.parentNode() == null ? '' : node.parentNode().data().key
      var parentName = node.parentNode() == null ? '' : node.parentNode().data().value.name
  
      if(parentKey == '') { //Root node
        //Fetch organisation unit information
        try{
          var ou_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                            organisationUnitSearch_req_code + nodeKey, {
            method: "GET",
            headers: {
              "Authorization":"Basic " + encodedDHIS2
            }
          })
          .then(response => response.json())
          .then(function handleData(data) {
            return_data = data;
          })
        } catch(err) {
          console.log("In Root Node - Fetch Organisation unit info: " + err)
          return
        }
        //console.log("*************" + return_data + "**************");
        if(return_data && return_data.organisationUnits.length == 0) { //node does not exist
          var nodeToInsert = {
              "name": "Federal Ministry of Health", 
              "openingDate": '1980-06-15',
              "shortName": utils.returnShortName('Federal Ministry of Health'),
              "code": nodeKey
          }
        }
      } else {
        //Fetch organisation unit information
        try{
        var ou_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req +  
                          organisationUnitSearch_req_code + nodeKey, {
          method: "GET",
          headers: {
            "Authorization":"Basic " + encodedDHIS2
          }
        })
        .then(response => response.json())
        .then(function handleData(data) {
          return_data = data;
        })
      } catch(err) {
        console.log("In branch Node - Fetch Organisation unit info: " + err)
        return
      }
        if(return_data && return_data.organisationUnits.length == 0) { //node does not exist
          //Fetch parent  organisation unit information
         try{ 
          var ou_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                organisationUnitSearch_req_code + parentKey, {
            method: "GET",
            headers: {
              "Authorization":"Basic " + encodedDHIS2
              }
            })
          .then(response => response.json())
          .then(function handleData(data) {
            return_data = data;
          })
        } catch(err) {
          console.log("In branch Node - Fetch Organisation unit parent info: " + err)
          return
        }
          
           //console.log()
          if(return_data && return_data.organisationUnits.length > 0) {
            console.log("%%%%%%%" + mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                        organisationUnitSearch_req_code + parentKey + "%%%%%%%")
            console.log("%%%%%%%%" + JSON.stringify(return_data) + "%%%%%%%%")
          var nodeToInsert = {
            "name": nodeName, 
            "openingDate": '1980-06-15',
            "shortName": utils.returnShortName(nodeName),
            "code": nodeKey,
            "parent":{
              "id": return_data.organisationUnits[0].id
            }
          }
          }
        }
      }

      if(nodeToInsert != null){
      //Add new parent Organisation Unit
      try{
      var insert_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req, {
        method: "POST",
        headers: {
          "Authorization":"Basic " + encodedDHIS2,
          "Content-Type":"application/json"
        },
        body: JSON.stringify(nodeToInsert)
        
      })
      .then(response => response.json())
      .then(function handleData(data) {
        return_data = data;
      })
    } catch(err) {
      console.log("Register Organisation unit info: " + err)
      return
    }
  }
      
  })
  
  var responseBody = JSON.stringify(return_data)
    
  // capture orchestration data
  var orchestrationResponse = { statusCode: 200, headers: headers }
  //let orchestrations = []
  orchestrations.push(utils.buildOrchestration('Hierarchy Sync DIS2', new Date().getTime(), req.method, 
                      req.url, req.headers, req.body, orchestrationResponse, responseBody))

   
  /******************************************
      FETCH SITE DETAIL INFORMATION
      Connects to MFR API for site detail
  *******************************************/
  
   let mfrSiteDetailResponseBody
   var fetchURL = mediatorConfig.config.baseurl + collection_req + '/' + 
                  collection_id + '.json' + '?created_since=' + lastAdded + '&page=1'
   //var nextPage = true

   while(fetchURL) {
     console.log("^^^^^^^^^^^" + fetchURL + "^^^^^^^^^^")
    try{
      //Fetch site detail
      var site_detail = await fetch(fetchURL, {
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

    responseBody = JSON.stringify(sites)
    
    // capture orchestration data
    var orchestrationResponse = { statusCode: sites.status, headers: headers }
    //let orchestrations = []
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, 
                      req.url, req.headers, req.body, orchestrationResponse, responseBody))
      

    /*****************************************
      SYNC NEWLY ADDED FACILITITES
      Connects to MFR API for facilities and
      writes them to DHIS2
    ******************************************/
    
    let organisationUnits = []
    for(var n = 0; n < sites.sites.length; n++) {
      var node = tree.traverser().searchBFS(function(data){
        return data.key === sites.sites[n].properties.Admin_health_hierarchy;
      });

      let parents = []
      while(node) {
        parents.push ({
          "name": node._data.value.name,
          "id": node.data().key,
          "openingDate": '1980-06-15',
          "shortName": utils.returnShortName(node._data.value.name),
        })
        node = node._parentNode
      }

      let parent_id
      for(var i = parents.length - 1; i >= 0; i--) {
        console.log(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                      organisationUnitSearch_req_code + parents[i].id)
        //Fetch organisation unit information
        var ou_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                                      organisationUnitSearch_req_code + parents[i].id, {
          method: "GET",
          headers: {
            "Authorization":"Basic " + encodedDHIS2
          }
        })
        .then(response => response.json())
        .then(function handleData(data) {
          return_data = data;
        })
        
        if(return_data.organisationUnits.length > 0) {
          parent_id = return_data.organisationUnits[0].id
          //break
        } else {
          if(i == parents.length - 1) {
            var parentOrganisationUnit = {
              "name": parents[i].name, 
              "openingDate": '1980-06-15',
              "shortName": utils.returnShortName(parents[i].name),        
            }
          } else {
            var parentOrganisationUnit = {
              "name": parents[i].name, 
              "openingDate": '1980-06-15',
              "shortName": utils.returnShortName(parents[i].name),
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
      var parentPHCUCase = false
      if(parent_id) {
        if(sites.sites[n].properties.isPhcu ) {
          var found
          if(sites.sites[n].properties.parentPhcuId != null) {//This is the child in the PHCU
            //Search whether the PHCU parent is already in DHIS2 as parent
            //Search by name and parent_id if available
            //First fetch the PHCU parent detail from the sites array
            var sitesArray = sites.sites;
            found = sitesArray.find(function(element) {
              return element['properties']['ethiopian_national_identifier'] == sites.sites[n].properties.parentPhcuId;
            });
          } else { //This is the parent in the PHCU
            found = sites.sites[n]
            parentPHCUCase = true
          }
          var phcu_return_data
          var phcu_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                                organisationUnitSearch_req + found.name + organisationUnitSearch_req_parent + 
                                parent_id, {
            method: "GET",
            headers: {
              "Authorization":"Basic " + encodedDHIS2
            }
          })
          .then(response => response.json())
          .then(function handleData(data) {
              phcu_return_data = data;
          })

          if(phcu_return_data.organisationUnits.length > 0) { //The PHCU parent exists as a parent in DHIS2
            //Check if it also exists as a child to this parent PHCU
            var phcu_chid_return_Data
            var phcu_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                                organisationUnitSearch_req + found.name + organisationUnitSearch_req_code + 
                                sites.sites[n].properties.parentPhcuId, {
              method: "GET",
              headers: {
                "Authorization":"Basic " + encodedDHIS2
              }
            })
            .then(response => response.json())
            .then(function handleData(data) {
              phcu_chid_return_Data = data;
            })
            if(phcu_chid_return_Data.organisationUnits.length == 0) { //Create it as a child to this parent PHCU in DHIS2
              var phcuDataToInsert = {
                "name":found.name, 
                "openingDate": found.properties.year_opened ? found.properties.year_opened : 
                              '1980-06-15',
                "shortName": found.properties.short_name ? found.properties.short_name : 
                              utils.returnShortName(found.name), 
                "latitude": found.lat,
                "longitude": found.long,
                "code": sites.sites[n].properties.parentPhcuId,
                "phoneNumber": found.facility__official_phone_number,
                "parent":{
                  "id": phcu_return_data.organisationUnits[0].id
                }
              }
              try{
                var phcu_insert_return_data
                var phcu_insert_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req, {
                  method: "POST",
                  headers: {
                    "Authorization":"Basic " + encodedDHIS2,
                    "Content-Type":"application/json"
                  },
                  body: JSON.stringify(phcuDataToInsert)
                  
                })
                .then(response => response.json())
                .then(function handleData(data) {
                  phcu_insert_return_data = data;
                })
              } catch(err) {
                console.log("Register Organisation unit info: " + err)
                return
              }
            }
            //Update the parent info of the organisation unit defining its parent as the PHCU parent
            parent_id = phcu_return_data.organisationUnits[0].id
            
          } else { //Create the PHCU parent as a parent and as a child as well in DHIS2
            //As a parent
            var phcuParentDataToInsert = {
              "name":found.name, 
              "openingDate": found.properties.year_opened ? found.properties.year_opened : 
                            '1980-06-15',
              "shortName": found.properties.short_name ? found.properties.short_name : 
                            utils.returnShortName(found.name), 
              "latitude": found.lat,
              "longitude": found.long,
              "code": sites.sites[n].properties.parentPhcuId,
              "phoneNumber": found.facility__official_phone_number,
              "parent":{
                "id": parent_id
              }
            }
            try{
              var phcu_parent_insert_return_data
              var phcu_insert_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req, {
                method: "POST",
                headers: {
                  "Authorization":"Basic " + encodedDHIS2,
                  "Content-Type":"application/json"
                },
                body: JSON.stringify(phcuParentDataToInsert)
                
              })
              .then(response => response.json())
              .then(function handleData(data) {
                phcu_parent_insert_return_data = data;
              })
            } catch(err) {
              console.log("Register Organisation unit info: " + err)
              return
            }
            //As a child
            var phcuChildDataToInsert = {
              "name":found.name, 
              "openingDate": found.properties.year_opened ? found.properties.year_opened : 
                            '1980-06-15',
              "shortName": found.properties.short_name ? found.properties.short_name : 
                            utils.returnShortName(found.name), 
              "latitude": found.lat,
              "longitude": found.long,
              "code": sites.sites[n].properties.parentPhcuId,
              "phoneNumber": found.facility__official_phone_number,
              "parent":{
                "id": phcu_parent_insert_return_data.response.uid
              }
            }
            try{
              var phcu_child_insert_return_data
              var phcu_insert_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req, {
                method: "POST",
                headers: {
                  "Authorization":"Basic " + encodedDHIS2,
                  "Content-Type":"application/json"
                },
                body: JSON.stringify(phcuChildDataToInsert)
                
              })
              .then(response => response.json())
              .then(function handleData(data) {
                phcu_child_insert_return_data = data;
              })
            } catch(err) {
              console.log("Register Organisation unit info: " + err)
              return
            }
            //Update the parent info of the organisation unit defining its parent as the PHCU parent
            parent_id = phcu_parent_insert_return_data.response.uid
          }

        
        }
        var organisationUnit = {
          "name":sites.sites[n].name, 
          "openingDate": sites.sites[n].properties.year_opened ? sites.sites[n].properties.year_opened : 
                        '1980-06-15',
          "shortName": sites.sites[n].properties.short_name ? sites.sites[n].properties.short_name : 
                        utils.returnShortName(sites.sites[n].name), 
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
          "openingDate": sites.sites[n].properties.year_opened ? sites.sites[n].properties.year_opened : 
                          '1980-06-15',
          "shortName": sites.sites[n].properties.short_name ? sites.sites[n].properties.short_name : 
                      utils.returnShortName(sites.sites[n].name), 
          "latitude": sites.sites[n].lat,
          "longitude": sites.sites[n].long,
          "code": sites.sites[n].properties.ethiopian_national_identifier,
          "phoneNumber": sites.sites[n].facility__official_phone_number
        
        }
      }
      if(!parentPHCUCase) {
        organisationUnits.push(organisationUnit)
      }

      orchestrationResponse = {}//{ statusCode: 200, headers: headers }
      orchestrations.push(utils.buildOrchestration('Fetch specific site and do data transformation', 
                    new Date().getTime(), '', '', '', '', orchestrationResponse, JSON.stringify(organisationUnit)))
    }  

    //console.log("================Organisation Units=============" + organisationUnits)
    
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
    
    //Manage page
    fetchURL = sites.nextPage
  } //While loop based on nextPage ends here  
  
  //Update the last_added date/time
  try {
    let now = new Date();
    fs.writeFileSync(__dirname + last_added, date.format(now, 'YYYY-MM-DD HH:mm:ssZ'), 'utf8')
  } catch (err) {
    lastAdded = err.message
    const headers = { 'content-type': 'application/text' }

    // set content type header so that OpenHIM knows how to handle the response
    res.set('Content-Type', 'application/json+openhim')

    // construct return object
    res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, lastAdded, 
                orchestrations, properties))
    return
  }
///////////////////////////////////////////////UPDATE////////////////////////////////////////

/******************************************
      FETCH SITE DETAIL INFORMATION
      Connects to MFR API for site detail
  *******************************************/
 
 mfrSiteDetailResponseBody
 fetchURL = mediatorConfig.config.baseurl + collection_req + '/' + 
                collection_id + '.json' + '?updated_since=' + lastUpdated + '&page=1'
 
 while(fetchURL) {
   console.log("^^^^^^^^^^^" + fetchURL + "^^^^^^^^^^")
  try{
    //Fetch site detail
    var site_detail = await fetch(fetchURL, {
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

  responseBody = JSON.stringify(sites)
  
  // capture orchestration data
  orchestrationResponse = { statusCode: sites.status, headers: headers }
  //let orchestrations = []
  orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, 
                req.url, req.headers, req.body, orchestrationResponse, responseBody))
    

  /*****************************************
    SYNC UPDATED FACILITITES
    Connects to MFR API for facilities and
    updates them to DHIS2
  ******************************************/
  
  let organisationUnits = []
  for(var n = 0; n < sites.sites.length; n++) {
    
    //Fetch organisation unit information
    var ou_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                                  organisationUnitSearch_req_code + 
                                  sites.sites[n].properties.Admin_health_hierarchy, {
      method: "GET",
      headers: {
        "Authorization":"Basic " + encodedDHIS2
      }
      })
      .then(response => response.json())
      .then(function handleData(data) {
        return_data = data;
      })

    //if(return_data.organisationUnits.length > 0) {
    var parent_id = return_data.organisationUnits[0].id
    
    //Fetch organisation unit information
    var ou_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnit_req + 
                                organisationUnitSearch_req_code + 
                                sites.sites[n].properties.ethiopian_national_identifier, {
      method: "GET",
      headers: {
      "Authorization":"Basic " + encodedDHIS2
      }
      })
      .then(response => response.json())
      .then(function handleData(data) {
        return_data = data;
      })

      var org_unit_id = return_data.organisationUnits[0].id

      var organisationUnit = {
        "id": org_unit_id,
        "name": sites.sites[n].name, 
        "openingDate": sites.sites[n].properties.year_opened ? sites.sites[n].properties.year_opened : 
                        '1980-06-15',
        "shortName": sites.sites[n].properties.short_name ? sites.sites[n].properties.short_name : 
                      utils.returnShortName(sites.sites[n].name), 
        "latitude": sites.sites[n].lat,
        "longitude": sites.sites[n].long,
        "code": sites.sites[n].properties.ethiopian_national_identifier,
        "phoneNumber": sites.sites[n].facility__official_phone_number,
        "parent":{
          "id": parent_id
        }
    }
   
    organisationUnits.push(organisationUnit)

    orchestrationResponse = {}//{ statusCode: 200, headers: headers }
    orchestrations.push(utils.buildOrchestration('Fetch specific site and do data transformation', 
                          new Date().getTime(), '', '', '', '', orchestrationResponse, 
                          JSON.stringify(organisationUnit)))
  }  

  const dhisImport = {
    "organisationUnits": organisationUnits
  }
  
  //Add new Organisation Units
  var insert_detail = await fetch(mediatorConfig.config.DHIS2baseurl + organisationUnitUpdate_req, {
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
  
  //Manage page
  fetchURL = sites.nextPage
} //While loop based on nextPage ends here  
//Update the last_updated date/time
try {
  let now = new Date();
  fs.writeFileSync(__dirname + last_updated, date.format(now, 'YYYY-MM-DD HH:mm:ssZ'), 'utf8')
} catch (err) {
  lastUpdated = err.message
  const headers = { 'content-type': 'application/text' }

  // set content type header so that OpenHIM knows how to handle the response
  res.set('Content-Type', 'application/json+openhim')

  // construct return object
  res.send(utils.buildReturnObject(mediatorConfig.urn, 'Failed', 404, headers, lastUpdated, 
              orchestrations, properties))
  return
}

//////////////////////////////////////////////////////////////////////////////////////////////

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
