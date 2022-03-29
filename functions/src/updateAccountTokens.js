const functions = require("firebase-functions");
const solana = require("@solana/web3.js");
const admin = require("firebase-admin");
const util = require("./util");

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

  const fungibleTokens = new Map();
  const nonFungibleTokens = new Map();
  for (let i = 0; i < accountTokens.length; i += 1) {
    const parsedAccountToken = accountTokens[i].account.data;
    const tokenMint = parsedAccountToken?.parsed?.info?.mint;
    const tokenAmount = parsedAccountToken?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    if (tokenMint !== undefined && tokenAmount > 0) {
      // We define an NFT the same way as Phantom, a token with 0 decimals and supply of 1.
      // Ref: https://docs.phantom.app/integrating/tokens/non-fungible-tokens
      const supply = parsedAccountToken.parsed.info.tokenAmount.amount;
      const decimals = parsedAccountToken.parsed.info.tokenAmount.decimals;
      const isNft = supply === '1' && decimals === 0;
      if (isNft) {
        nonFungibleTokens.set(tokenMint, {isFungible: false, mint: tokenMint, ammountOwned: tokenAmount});
      } else {
        fungibleTokens.set(tokenMint, {isFungible: true, mint: tokenMint, ammountOwned: tokenAmount});
      }
    }
  }
  return [fungibleTokens, nonFungibleTokens];
}

/// Generates a unique ID for an NFT collection given its metadata.
function generateNftCollectionId(collectionName, creatorMintAddresses) {
  creatorMintAddresses.sort();
  const concat = [
    collectionName,
    creatorMintAddresses.length.toString(),
    ...creatorMintAddresses].join("");
  String.prototype.hashCode = function() {
    var hash = 0, i, chr;
    if (this.length === 0) return hash;
    for (i = 0; i < this.length; i++) {
      chr   = this.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };
  return concat.hashCode().toString();
}

/// Given an array of non-fungible tokens, aggregates the non-fungible tokens
/// into collections and returns a map where each key is a collection ID and the value
/// is an object with all tokens that belong to such collection.
async function buildNftCollections(connection, tokens) {
  
  const metadataPromises = [];
  tokens.forEach((element, ) => {
    metadataPromises.push(util.fetchNftMetadata(connection, element.mint));
  });
  
  const metadata = await Promise.all(metadataPromises);

  const collections = new Map();
  for (let i = 0; i < metadataPromises.length; i++) {
    const symbol = metadata[i].data.data.symbol;
    const creators = metadata[i].data.data.creators?.map((item) => item.address);
    const mint = metadata[i].data.mint;
    const collectionId = generateNftCollectionId(symbol, creators);
    const ownedCollectionTokens = collections.get(collectionId);
  
    collections.set(collectionId, {
      collectionId: collectionId,
      symbol: symbol,
      creatorMints: creators,
      tokensOwned: ownedCollectionTokens === undefined ? [mint] : [mint, ...ownedCollectionTokens.tokensOwned],
    });
  }

  return collections;
}

/// Returns a map with nonfungible token collections owned by provided public key.
/// Each key in the map corresponds to an NFT collection ID, and the value to data about the collection.
async function getAccountNonFungibleTokensByCollection(publicKey) {
  const connection = util.createSolanaConnectionConfig();
  const [, nonFungibleTokens] = await fetchSplTokenBalances(connection, publicKey);
  return buildNftCollections(connection, nonFungibleTokens);
}

/// Updates tokensOwnedByCollection field in DB and returns the object set in the DB.
exports.updateAccountNonFungibleTokens = functions.https.onCall(async (data, context) => {

  util.verifyUserAuthenticated(context);

  const nonFungibleTokenCollections = await getAccountNonFungibleTokensByCollection(context.auth.uid);
  const response = {
    tokensOwnedByCollection: Object.fromEntries(nonFungibleTokenCollections)
  }

  try {
    // Update tokens owned for logged in user.
    const userRef = admin.firestore().collection("users").doc(context.auth.uid);
    await userRef.update(response,  { merge: true });
    // Cloud Functions callables can't serialize maps, so we must return an object.
    return response;
  } catch (error) {
    throw new functions.https.HttpsError(
      "unavailable",
      `Tokens owned not changed successfully ${error?.message}`
    );
  }
});

/// Returns a map with fungible tokens owned by provided public key.
/// Each key in the map corresponds to a token's mint, and the value to data about the token.
async function getAccountFungibleTokensByMint(publicKey) {
  const connection = util.createSolanaConnectionConfig();
  const [fungibleSplTokens, ] = await fetchSplTokenBalances(connection, publicKey);
  const solBalance = await connection.getBalance(new solana.PublicKey(publicKey));
  const fungibleTokens = fungibleSplTokens.set('SOL', { isFungible: true, mint: 'SOL', ammountOwned: solBalance / solana.LAMPORTS_PER_SOL });
  return fungibleTokens;
}

/// Updates tokensOwnedByMint field in DB and returns the object set in the DB.
exports.updateAccountFungibleTokens = functions.https.onCall(async (data, context) => {

  util.verifyUserAuthenticated(context);

  const fungibleTokens = await getAccountFungibleTokensByMint(context.auth.uid);
  const response = {
    tokensOwnedByMint: Object.fromEntries(fungibleTokens),
  }
  
  try {
    // Update tokens owned for logged in user.
    const userRef = admin.firestore().collection("users").doc(context.auth.uid);
    await userRef.set(response, { merge: true });
    // Cloud Functions callables can't serialize maps, so we must return an object.
    return response;
  } catch (error) {
    throw new functions.https.HttpsError(
      "unavailable",
      `Tokens owned not changed successfully ${error?.message}`
    );
  }
});