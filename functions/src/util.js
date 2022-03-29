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

module.exports = { verifyUserAuthenticated, createSolanaConnectionConfig, fetchNftMetadata, fetchAndValidateUser };
