const functions = require("firebase-functions");
const admin = require("firebase-admin");
const util = require("./util");
const solana = require("@solana/web3.js");

async function fetchCommunity(cid) {
  const communityRef = admin.firestore().collection("communities").doc(cid);
  const communityDocSnap = await communityRef.get();
  return { communityRef, communityDocSnap };
}

/// Returns basic data about a provided mint ID or undefined if provided
/// mint ID is not associated with a token.
async function getTokenData(mint) {
  const connection = util.createSolanaConnectionConfig();
  if (mint === 'SOL') {
    return {
      mint,
      isFungible: true
    };
  }
  const res = await connection.getParsedAccountInfo(new solana.PublicKey(mint));
  const { supply, decimals } = res.value?.data?.parsed?.info;
  const isFungible = supply > 1 && decimals > 0;
  if (isFungible) {
    return {
      mint,
      isFungible,
    };
  }
  const metadata = await util.fetchNftMetadata(connection, mint);
  const symbol = metadata.data.data.symbol;
  const creators = metadata.data.data.creators?.map((item) => item.address);
  return {
    isFungible,
    symbol: symbol,
    creators: creators,
    sampleToken: mint
  };
}

async function getTokenMintFromId(userId, postAccessId) {
  const { _, userDocSnap } = await util.fetchAndValidateUser(userId);

  const fungibleTokensForAccessId = userDocSnap.data().tokensOwnedByMint[postAccessId];
  const nonFungibleTokensForAccessId = userDocSnap.data().tokensOwnedByCollection[postAccessId];

  if (fungibleTokensForAccessId !== undefined) {
    // For non-fungible tokens, post access id is the same as the token mint.
    return postAccessId;
  } else if (nonFungibleTokensForAccessId !== undefined) {
    // Return the first token from the user's collection.
    return nonFungibleTokensForAccessId.tokensOwned[0];
  }
  throw new functions.https.HttpsError('Author does not have sufficient funds to create post for specified token or token collection.');
}

async function createCommunity(communityRef, post) {
  try {
    // Get current user
    const tokenMint = await getTokenMintFromId(post.authorUserId, post.accessId);
    const tokenData = await getTokenData(tokenMint);

    const categories = post.category !== "" ? [{ name: post.category, count: 1 }] : [];
    const communityData = {
      chain: 'Solana',
      tokenData: tokenData,
      categories
    }
    await communityRef.set(communityData);
  } catch (error) {
    // TODO: Remove the post from the post preview and post table.
    // TODO: re-throw the error
  }
}

/// Triggered on 'postPreviews' collection create, this function initializes a new community
/// in the community collection when the first post for a token is created.
exports.createPost = functions.firestore
  .document("postPreviews/{docId}")
  .onCreate(async (snap, context) => {
    const post = snap.data();

    const { communityRef, communityDocSnap } = await fetchCommunity(
      post.accessId
    );

    if (!communityDocSnap.exists) {
      await createCommunity(communityRef, post);
    } else if (post.category !== "") {
      let category = communityDocSnap
        .data()
        .categories.find((item) => item.name === post.category);
      if (category === undefined) {
        category = { name: post.category, count: 1 };
      } else {
        category = { name: category.name, count: category.count + 1 };
      }
      const filteredCategories = communityDocSnap
        .data()
        .categories.filter((item) => item.name !== post.category);

      await communityRef.update(
        { categories: [category, ...filteredCategories] },
      );
    }
  });
