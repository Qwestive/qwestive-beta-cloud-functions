const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.applicationDefault() });

exports.authentication = require("./src/authentication");

exports.userSettings = require("./src/userSettings");

exports.postActions = require("./src/postActions");

exports.commentActions = require("./src/commentActions");

exports.createPostTrigger = require("./src/createPostTrigger");

exports.verifyTokenOwned = require("./src/verifyTokenOwned");
