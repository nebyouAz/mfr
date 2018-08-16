#!/bin/sh

mkdir api
mkdir api/sites
mkdir api/collections

wget http://142.93.40.43:6000/cms/collections.json && mv collections.json api/
wget http://142.93.40.43:6000/cms/sites_id.json && mv sites_id.json api/sites/35.json
wget http://142.93.40.43:6000/cms/collection_id.json && mv collection_id.json api/collections/3.json

mv index.js index.js.bak
wget http://142.93.40.43:6000/cms/index.js