const admin = require("firebase-admin");
const serviceAccount = require("./ServiceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

exports.authentication = require("./subFunctions/authentication");

exports.userSettings = require("./subFunctions/userSettings");
