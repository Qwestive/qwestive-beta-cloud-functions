const functions = require('firebase-functions');
const admin = require("firebase-admin");

async function fetchCommunity(cid) {
  const communityRef = admin.firestore().collection("communities").doc(cid);
  const communityDocSnap = await communityRef.get();
  return {communityRef, communityDocSnap};
}

/// Triggered by post collection create, this function initializes a new community
/// in the community collection when the first post for a token is created.
exports.createPost = functions.firestore
  .document('posts/{docId}')
  .onCreate(async (snap, context) => {
    const post = snap.data();

    const {communityRef, communityDocSnap} = await fetchCommunity(post.accessTokenId);

    if (!communityDocSnap.exists) {
      await communityRef.set({
        categories: [{ name: post.category, count: 1 }],
      });
    } else {
      let category = communityDocSnap.data().categories.find(item => item.name === post.category);
      if (category === undefined) {
        category = { name: post.category, count: 1 };
      } else {
        category = { name: category.name, count: category.count + 1 };
      }
      const updatedCategories = communityDocSnap.data().categories.filter(item => item.name !== post.category);
      updatedCategories.push(category);
      await communityRef.set({ categories: updatedCategories }, { merge: true });
    }
});