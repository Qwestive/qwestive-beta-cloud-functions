const solana = require("@solana/web3.js");
const metaplex = require("@metaplex-foundation/mpl-token-metadata");
const functions = require("firebase-functions");
const admin = require("firebase-admin");

/// Verifies calling user is authenticated.
function verifyUserAuthenticated(context) {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated."
    );
  }
}

/// Retrieves user with provided UID from Firestore and returns associated 
/// document ref and document snapshot.
async function fetchAndValidateUser(userId) {
  const userRef = admin.firestore().collection("users").doc(userId);
  const userDocSnap = await userRef.get();
  if (!userDocSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Invalid user credentials"
    );
  }
  return { userRef, userDocSnap };
}

/// Retrieves post with provided ID from Firestore and returns associated 
/// document ref and document snapshot.
async function fetchAndValidatePost(postId) {
  if (!(typeof postId === "string" || postId instanceof String)) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Provided Post ID is not a valid string"
    );
  }
  const postRef = admin.firestore().collection("postPreviews").doc(postId);
  const postDocSnap = await postRef.get();
  if (!postDocSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      `Provided Post ID: ${postId} does not exist`
    );
  }
  return { postRef, postDocSnap };
}

/// Builds a connection object to Solana network.
function createSolanaConnectionConfig() {
  return new solana.Connection(
    solana.clusterApiUrl("devnet"),
    "confirmed"
  );
}

/// Generates Metaplex metadata object for a provided non-fungible token mint.
async function fetchNftMetadata(connection, mint) {
  const tokenMetaPubkey = await metaplex.Metadata.getPDA(new solana.PublicKey(mint));
  return metaplex.Metadata.load(connection, tokenMetaPubkey);
}

// When provided with user data and prost data from the DB, it verifies if provided user
// has access to the provided post.
function verifyUserMeetsTokenRequirements(userData, postData) {
  // Check that provided user meets required token balance.
  const fungibleTokensOwned = userData.tokensOwnedByMint[postData.accessId]?.ammountOwned;
  const nonFungibleTokensOwned = userData.tokensOwnedByCollection[postData.accessId]?.tokensOwned?.length;
  const hasFungibleAccess = fungibleTokensOwned && fungibleTokensOwned > postData.minimumAccessBalance;
  const hasNonFungibleAccess = nonFungibleTokensOwned && nonFungibleTokensOwned > postData.minimumAccessBalance;
  if (!hasFungibleAccess && !hasNonFungibleAccess) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "User does not meet minimum required token balance to vote on this post"
    );
  }
}

module.exports = { verifyUserAuthenticated, fetchAndValidateUser, fetchAndValidatePost, createSolanaConnectionConfig, fetchNftMetadata,
verifyUserMeetsTokenRequirements };
