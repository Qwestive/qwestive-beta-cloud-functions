const functions = require("firebase-functions");
const admin = require("firebase-admin");
const tweetnacl = require("tweetnacl");
/*
First step of Checkin process
If it is a new user we allow them to register
If it is an existing user we the nonce to be signed by the wallet
*/
exports.userCheckIn = functions.https.onCall(async (data) => {
  const uid = data.uid;
  if (!(typeof uid === "string" || uid instanceof String)) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a string uid"
    );
  }
  const loginMessage = "Sign this message to login into Qwestive.";
  const signupMessage = "Sign this message to signup into Qwestive.";

  try {
    await admin.auth().getUser(uid);
  } catch {
    return {
      // New user he can signin
      info: "New user Signup",
      message: signupMessage,
    };
  }

  try {
    //user Exist
    const userRef = admin.firestore().collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      // user not found strange occurence (auth but not firestore)
      // we create the user in firestore
      const nonce = Math.floor(100000 + Math.random() * 900000);
      await userRef.set(
        {
          nonce: nonce,
        },
        { merge: true }
      );
      return {
        info: "User not found, created it",
        message: `${loginMessage} ${nonce}`,
      };
    }
    if (userDoc.data().nonce !== undefined) {
      return {
        info: "User needs to sign the nonce",
        message: `${loginMessage} ${userDoc.data().nonce}`,
      };
    }
    // nonce was not found, should not happen (problem when initialized user)
    const nonce = Math.floor(100000 + Math.random() * 900000);
    await userRef.set(
      {
        nonce: nonce,
      },
      { merge: true }
    );
    return {
      info: "No nonce was not found, we made a new one",
      message: `${loginMessage} ${nonce}`,
    };
  } catch (error) {
    // error
    throw new functions.https.HttpsError("unavailable", error?.message);
  }
});

/*
Second step of Checkin process
We verify that the message signed by the valet correspond to the message 
we wanted signed from the wallet

TODO:
- if you are bored you can check validity of the input at the beginning
if not valid it will return internal error either way
*/
exports.userSignin = functions.https.onCall(async (data) => {
  const uid = data.uid;
  const encodedMessage = new Uint8Array(Object.values(data.encodedMessage));
  const signature = new Uint8Array(Object.values(data.signature));
  const publicKey = new Uint8Array(Object.values(data.publicKeyBytes));

  const decoded = new TextDecoder().decode(encodedMessage);
  const userRef = admin.firestore().collection("users").doc(uid);

  try {
    const validSign = tweetnacl.sign.detached.verify(
      encodedMessage,
      signature,
      publicKey
    );
    if (!validSign) {
      throw new Error("Signature invalid");
    }
  } catch (error) {
    throw new functions.https.HttpsError("permission-denied", error?.message);
  }

  try {
    await admin.auth().getUser(uid);
  } catch {
    try {
      //user doesn't exist we just check the wallet is valid
      await userRef.set(
        {
          nonce: Math.floor(100000 + Math.random() * 900000),
          userName: uid,
          displayName: "",
          bio: "",
          personalLink: "",
          profileImage:
            "https://firebasestorage.googleapis.com/v0/b/qwestive-beta-prod.appspot.com/o/defaultImages%2FprofileImage%2FprofilePic.png?alt=media&token=c58be011-b854-43c5-9fee-3606f44184d0",
          coverImage:
            "https://firebasestorage.googleapis.com/v0/b/qwestive-beta-prod.appspot.com/o/defaultImages%2FcoverImage%2FcoverPic.png?alt=media&token=4d20be09-f179-4414-94cd-be08ed6324d4",
        },
        { merge: true }
      );

      const customToken = await admin.auth().createCustomToken(uid);
      return {
        info: "New user can Signup",
        customToken: customToken,
      };
    } catch (error) {
      throw new functions.https.HttpsError("unavailable", error?.message);
    }
  }

  //user exist we need to verify the nonce
  try {
    const nonce = decoded.slice(-6);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new Error("user not found, could not verify nonce");
    }
    if (userDoc.data().nonce !== undefined) {
      if (userDoc.data().nonce == nonce) {
        await userRef.set(
          {
            nonce: Math.floor(100000 + Math.random() * 900000),
          },
          { merge: true }
        );

        const customToken = await admin.auth().createCustomToken(uid);
        return {
          info: "User can Login",
          customToken: customToken,
        };
      }
      throw new Error("The nonce is not correct");
    }
  } catch (error) {
    throw new functions.https.HttpsError("unavailable", error?.message);
  }
});
