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

async function fetchAndValidateComment(commentId) {
  if (!(typeof commentId === "string" || commentId instanceof String)) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Provided Comment ID is not a valid string"
      );
  }
  const commentRef = admin.firestore().collection("comments").doc(commentId);
  const commentDocSnap = await commentRef.get();  
  if (!commentDocSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Invalid comment ID"
    );
  }
  return {commentRef, commentDocSnap};
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
  
  // Get current user
  const uid = context.auth.uid;
  const {_, userDocSnap} = await fetchAndValidateUser(uid);
  
  // Get target comment
  const commentId = data.commentId;
  const {commentRef, commentDocSnap} = await fetchAndValidateComment(commentId);

  // Get target post
  const postId = commentDocSnap.data().postId;
  const {__, postDocSnap} = await fetchAndValidatePost(postId);

  // Verify that user has access to the post to which this comment is associated.
  verifyUserMeetsTokenRequirements(userDocSnap.data(), postDocSnap.data());

  // Add user to upVote list if user is not already in upvote list.
  const upVotes = commentDocSnap.data().upVoteUserIds;
  if (upVotes.indexOf(uid) === -1) {
    await commentRef.update({
      upVoteUserIds: admin.firestore.FieldValue.arrayUnion(uid),
      downVoteUserIds: admin.firestore.FieldValue.arrayRemove(uid)
    });
    return {
      info: `Up vote for Comment ID: ${commentId} from User ID: ${uid} success`,
    };
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `User ID: ${uid}, has already been added to list of up votes for Comment ID: ${commentId}`
    );
  }
});

/// Add current user to the downvote list of a post.
exports.downVote = functions.https.onCall(async (data, context) => {
  
  // Get current user
  const uid = context.auth.uid;
  const {_, userDocSnap} = await fetchAndValidateUser(uid);
  
  // Get target comment
  const commentId = data.commentId;
  const {commentRef, commentDocSnap} = await fetchAndValidateComment(commentId);

    // Get target post
    const postId = commentDocSnap.data().postId;
    const {__, postDocSnap} = await fetchAndValidatePost(postId);

  // Verify that user has access to post.
  verifyUserMeetsTokenRequirements(userDocSnap.data(), postDocSnap.data()); 

  // Add user to downvote list if user is not already in downvote list.
  const downVotes = commentDocSnap.data().downVoteUserIds;
  if (downVotes.indexOf(uid) === -1) {
    await commentRef.update({
      downVoteUserIds: admin.firestore.FieldValue.arrayUnion(uid),
      upVoteUserIds: admin.firestore.FieldValue.arrayRemove(uid)
    });
    return {
      info: `Down vote for Comment ID: ${commentId} from User ID: ${uid} success`,
    };
  } else {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `User ID: ${uid}, has already been added to list of down votes for Comment ID: ${commentId}`
    );
  }
});
