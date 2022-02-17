const admin = require("firebase-admin");
admin.initializeApp();

exports.authentication = require("./src/authentication");

exports.userSettings = require("./src/userSettings");
