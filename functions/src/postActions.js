const functions = require("firebase-functions");
const admin = require("firebase-admin");

function verifyUserMeetsTokenRequirements(userData, postData) {
    // Check that provided user meets required token balance.
    if (postData.accessToken in userData.tokenBalances
        && postData.accessMinimumTokenBalance <= userData.tokenBalances[postData.accessToken]) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "User does not meet minimum required token balance to vote on this post"
      );
    }
}

async function fetchAndValidateUser(userId) {
  const userRef = admin.firestore().collection("users").doc(userId);
  const userDocSnap = await userRef.get();  
  if (!userDocSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Invalid user credentials"
    );
  }
  return {userRef, userDocSnap};
}

async function fetchAndValidatePost(postId) {
  if (!(typeof postId === "string" || postId instanceof String)) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Provided Post ID is not a valid string"
      );
  }
  const postRef = admin.firestore().collection("posts").doc(postId);
  const postDocSnap = await postRef.get();
  if (!postDocSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      `Provided Post ID: ${postId} does not exist`
    );
  }
  return {postRef, postDocSnap};
}

/// Add current user to the upvote list of a post.
exports.upVote = functions.https.onCall(async (data, context) => {
  const uid = context.auth.uid;
  const postId = data.postId;

  // Get current user
  const {_, userDocSnap} = await fetchAndValidateUser(uid);

  // Get target post
  const {postRef, postDocSnap} = await fetchAndValidatePost(postId);

  // Verify that user has access to post.
  verifyUserMeetsTokenRequirements(userDocSnap.data(), postDocSnap.data()); 

  // Add user to upVote list if user is not already in upvote list.
  const upVotes = postDocSnap.data().upVoteUserIds;
  if (upVotes.indexOf(uid) === -1) {
    try {
      const downVotes = postDocSnap.data().downVoteUserIds.filter((item) => item !== uid);
      await postRef.set({ upVoteUserIds: [uid, ...upVotes], downVoteUserIds: downVotes }, { merge: true });
      return {
        info: `Up vote for Post ID: ${postId} from User ID: ${uid} success`,
      };
    } catch (error) {
      throw new functions.https.HttpsError(
        "unknown",
        `Up vote for Post ID: ${postId} from User ID: ${uid} error: ${error?.message}`
      );
    }
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `User ID: ${uid}, has already been added to list of up votes for Post ID: ${postId}`
    );
  }
});

/// Add current user to the downvote list of a post.
exports.downVote = functions.https.onCall(async (data, context) => {
  const uid = context.auth.uid;
  const postId = data.postId;

  // Get current user
  const {_, userDocSnap} = await fetchAndValidateUser(uid);

  // Get target post
  const {postRef, postDocSnap} = await fetchAndValidatePost(postId);

  // Verify that user has access to post.
  verifyUserMeetsTokenRequirements(userDocSnap.data(), postDocSnap.data()); 

  // Add user to up vote list if user is not already in upvote list.
  const downVotes = postDocSnap.data().downVoteUserIds;
  if (downVotes.indexOf(uid) === -1) {
    try {
      const upVotes = postDocSnap.data().upVoteUserIds.filter((item) => item !== uid);
      await postRef.set({ upVoteUserIds: upVotes, downVoteUserIds: [uid, ...downVotes] }, { merge: true });
      return {
        info: `Down vote for Post ID: ${postId} from User ID: ${uid} success`,
      };
    } catch (error) {
      throw new functions.https.HttpsError(
        "unknown",
        `Down vote vote for Post ID: ${postId} from User ID: ${uid} error: ${error?.message}`
      );
    }
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `User ID: ${uid}, has already been added to list of down votes for Post ID: ${postId}`
    );
  }
});
