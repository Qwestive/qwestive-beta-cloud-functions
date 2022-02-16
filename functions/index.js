const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.applicationDefault() });

exports.authentication = require("./subFunctions/authentication");

exports.userSettings = require("./subFunctions/userSettings");
