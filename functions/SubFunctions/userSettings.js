const functions = require("firebase-functions");
const admin = require("firebase-admin");

const USERNAMEMAXLENGTH = 20;
const USERNAMEMINLENGTH = 4;

exports.editUserName = functions.https.onCall(async (data, context) => {
  const newUserName = data;
  // userName not valid string
  if (!(typeof newUserName === "string" || newUserName instanceof String)) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a string newUserName"
    );
  }

  // user not auth when calling the function
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called " + "while authenticated."
    );
  }

  // userName wrong size or value
  if (
    newUserName.length < USERNAMEMINLENGTH ||
    (newUserName.length > USERNAMEMAXLENGTH && newUserName !== context.auth.uid)
  ) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `The userName must be between ${USERNAMEMINLENGTH} and ${USERNAMEMAXLENGTH} or be the Publickey`
    );
  }

  const userRef = admin.firestore().collection("users").doc(context.auth.uid);

  // Check UserName did not change
  const userInfo = await userRef.get();
  if (userInfo.exists) {
    if (newUserName === userInfo.data().userName) {
      return {
        info: "userName did not change",
      };
    }
  } else {
    throw new functions.https.HttpsError(
      "unavailable",
      "unable to retrieve user informations"
    );
  }

  userNameRef = admin
    .firestore()
    .collection("users")
    .where("userName", "==", newUserName);

  try {
    const userNameQuery = await userNameRef.get();
    if (userNameQuery.docs.length !== 0) {
      throw new Error(`The userName ${newUserName} is taken`);
    }
  } catch (error) {
    throw new functions.https.HttpsError("unavailable", `${error?.message}`);
  }

  // Changing userName
  try {
    await userRef.set({ userName: newUserName }, { merge: true });
    return {
      info: "userName changed successfully",
    };
  } catch (error) {
    throw new functions.https.HttpsError(
      "unavailable",
      `userName not changed successfully ${error?.message}`
    );
  }
});
