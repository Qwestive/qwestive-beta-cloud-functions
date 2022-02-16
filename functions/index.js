const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.applicationDefault() });

exports.authentication = require("./src/authentication");

exports.userSettings = require("./src/userSettings");
