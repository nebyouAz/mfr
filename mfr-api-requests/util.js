var url, username, password;

module.exports = {
   url : "https://resourcemap.eth.instedd.org/api/",
   username : "fekaduw@gmail.com",
   password : "12345678",
   doencode: function() {
	 const encode = require('nodejs-base64-encode');
         tobeencoded = this.username + ":" + this.password;
	 return encode.encode(tobeencoded, 'base64');
   }	
};
