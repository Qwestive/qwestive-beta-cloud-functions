const functions = require("firebase-functions");
const solana = require("@solana/web3.js");
const admin = require("firebase-admin");

exports.verifyTokenOwned = functions.https.onCall(async (data, context) => {
  // user not auth when calling the function
  if (!context.auth) {
    // Throwing an HttpsError so that the client gets the error details.
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The function must be called while authenticated."
    );
  }
  const TOKEN_PROGRAM_ID = new solana.PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );
  const connection = new solana.Connection(
    solana.clusterApiUrl("devnet"),
    "confirmed"
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
            bytes: context.auth.uid, // base58 encoded string
          },
        },
      ],
    }
  );

  const filteredAccountTokens = [];
  for (let i = 0; i < accountTokens.length; i += 1) {
    const parsedAccountToken = accountTokens[i].account.data;
    if (
      parsedAccountToken?.parsed?.info?.mint !== undefined &&
      (parsedAccountToken?.parsed?.info?.tokenAmount?.uiAmount ?? 0) > 0
    )
      filteredAccountTokens.push({
        mint: parsedAccountToken.parsed.info.mint,
        amountHeld: parsedAccountToken.parsed.info.tokenAmount.uiAmount,
      });
  }

  const userRef = admin.firestore().collection("users").doc(context.auth.uid);

  // Changing Tokens owned
  try {
    await userRef.update({ tokensOwned: filteredAccountTokens });
    return {
      filteredAccountTokens,
    };
  } catch (error) {
    throw new functions.https.HttpsError(
      "unavailable",
      `Tokens owned  not changed successfully ${error?.message}`
    );
  }
});
