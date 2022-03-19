const functions = require("firebase-functions");
const solana = require("@solana/web3.js");
const admin = require("firebase-admin");


function verifyUserAuthenticated(context) {
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated."
    );
  }
}

/// Fetch balance of SPL tokens for a provided Public Key and connection (mainnet/devnet/etc).
async function fetchSplTokenBalances(connection, publicKey) {
  const TOKEN_PROGRAM_ID = new solana.PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );

  const accountTokens = await connection.getParsedProgramAccounts(
    TOKEN_PROGRAM_ID,
    {
      filters: [
        {
          dataSize: 165, // number of bytes
        },
        {
          memcmp: {
            offset: 32, // number of bytes
            bytes: publicKey, // base58 encoded string
          },
        },
      ],
    }
  );

  const filteredAccountTokens = new Map();
  for (let i = 0; i < accountTokens.length; i += 1) {
    const parsedAccountToken = accountTokens[i].account.data;
    if (
      parsedAccountToken?.parsed?.info?.mint !== undefined &&
      (parsedAccountToken?.parsed?.info?.tokenAmount?.uiAmount ?? 0) > 0
    )
      filteredAccountTokens.set(
        parsedAccountToken.parsed.info.mint,
        parsedAccountToken.parsed.info.tokenAmount.uiAmount
      );
  }
  return filteredAccountTokens;
}

/// Returns the token holdings of provided public key as an object with
/// token mint ID as key and balance of that mint ID as value. The exception
/// is SOL, where mint ID is subsituted by SOL.
exports.updateTokensOwned = functions.https.onCall(async (data, context) => {

  verifyUserAuthenticated(context);

  const connection = new solana.Connection(
    solana.clusterApiUrl("devnet"),
    "confirmed"
  );

  const publicKey = context.auth.uid;
  const splTokenBalances = await fetchSplTokenBalances(connection, publicKey);
  const solBalance = await connection.getBalance(new solana.PublicKey(publicKey));
  const tokenBalances = splTokenBalances.set('SOL', solBalance);
  const tokensOwned = {
    tokensOwned: Object.fromEntries(tokenBalances),
  }
  
  try {
    // Update tokens owned for logged in user.
    const userRef = admin.firestore().collection("users").doc(context.auth.uid);
    await userRef.update(tokensOwned)
    // Cloud Functions callables can't serialize maps, so we must return an object.
    return tokensOwned;
  } catch (error) {
    throw new functions.https.HttpsError(
      "unavailable",
      `Tokens owned  not changed successfully ${error?.message}`
    );
  }
});
