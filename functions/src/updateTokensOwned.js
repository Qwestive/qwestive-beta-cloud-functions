const functions = require("firebase-functions");
const solana = require("@solana/web3.js");
const admin = require("firebase-admin");
const metaplex = require("@metaplex-foundation/mpl-token-metadata");

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

  const fungibleTokens = new Map();
  const nonFungibleTokens = new Map();
  for (let i = 0; i < accountTokens.length; i += 1) {
    const parsedAccountToken = accountTokens[i].account.data;
    const tokenMint = parsedAccountToken?.parsed?.info?.mint;
    const tokenAmount = parsedAccountToken?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    if (tokenMint !== undefined && tokenAmount > 0) {
      // We define an NFT the same way as Phantom, a token with 0 decimals and supply of 1.
      // Ref: https://docs.phantom.app/integrating/tokens/non-fungible-tokens
      const isNft = false;
      if (isNft) {
        nonFungibleTokens.set(tokenMint, {mint: tokenMint, ammount: tokenAmount});
      } else {
        fungibleTokens.set(tokenMint, {mint: tokenMint, ammount: tokenAmount});
      }
    }
  }
  return [fungibleTokens, nonFungibleTokens];
}

function generateNftCollectionId(collectionName, creatorMintAddresses) {
  ///TODO: mint address should be sorted to ensure that resulting ID is consistent.
  creatorMintAddresses.sort();
  const concat = elements.join([
    collectionName,
    creatorMintAddresses.length.toString(),
    ...creatorMintAddresses]);
  console.log('The NFT string is');
  console.log(concat);
  String.prototype.hashCode = function() {
    var hash = 0, i, chr;
    if (this.length === 0) return hash;
    for (i = 0; i < this.length; i++) {
      chr   = this.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  };
  console.log('The hashcode is: ');
  console.log(concat.hashCode());
  return concat.hashCode();
}


async function generateNftMetadata(connection, mint) {
  if (mint !== 'SOL') {
    throw new Error('SOL is not a valid NFT mint address');
  }
  const mintPubkey = new PublicKey(mint);
  const tokenmetaPubkey = await Metadata.getPDA(mintPubkey);
  return Metadata.load(connection, tokenmetaPubkey);
}

async function buildNftCollections(connection, tokens) {
  const collections = {};
  tokens.array.forEach(element => {
    const metadata = await generateNftMetadata(connection, element.mint);
    const symbol = metadata.data.data.symbol;
    const creators = metadata.data.data.creators?.map((item) => item.address);
    const collectionId = generateNftCollectionId(nftSymbol, nftCreators);
    const ownedCollectionTokens = nftCollections.get(collectionId);

    collections.set(nftCollectionId, {
      symbol: symbol,
      creatorMints: creators,
      tokensOwned: ownedCollectionTokens === undefined ? [element.mint] : [element.mint, ...ownedCollectionTokens],
    });
  });
  return collections;
}

async function buildUserTokenCommunities(connection, publicKey) {
  const [fungibleTokens, nonFungibleTokens] = await fetchSplTokenBalances(connection, publicKey);
  const solBalance = await connection.getBalance(new solana.PublicKey(publicKey));
  const fungibleTokenCollections = fungibleTokens.set('SOL', { mint: 'SOL', ammount: solBalance });
  const nonFungibleTokenCollections = await buildNftCollections(connection, nonFungibleTokens);
  return new Map([...fungibleTokenCollections, ...nonFungibleTokenCollections]);
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

  const tokenCommunities = await buildUserTokenCommunities(connection, context.auth.uid);
  const response = {
    userTokenCommunities: tokenCommunities
  }
  
  try {
    // Update tokens owned for logged in user.
    const userRef = admin.firestore().collection("users").doc(context.auth.uid);
    await userRef.update(response)
    // Cloud Functions callables can't serialize maps, so we must return an object.
    return response;
  } catch (error) {
    throw new functions.https.HttpsError(
      "unavailable",
      `Tokens owned  not changed successfully ${error?.message}`
    );
  }
});
