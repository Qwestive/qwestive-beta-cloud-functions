const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.applicationDefault() });

exports.authentication = require("./src/authentication");

exports.userSettings = require("./src/userSettings");

exports.postActions = require("./src/postActions");

exports.createPostTrigger = require("./src/createPostTrigger");
