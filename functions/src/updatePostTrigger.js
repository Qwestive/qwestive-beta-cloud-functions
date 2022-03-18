const functions = require("firebase-functions");
const admin = require("firebase-admin");

/// Triggered by post collection updates, this function updates the post preview
/// collection accordingly.
/// TODO: update other post fields besides the votes.
exports.updatePost = functions.firestore
  .document("posts/{docId}")
  .onUpdate(async (change, context) => {

  const updatedPost = change.after.data();

  const postPreviewRef = admin.firestore().collection("postPreviews").doc(context.params.docId);

  await postPreviewRef.set({
    upVoteUserIds: updatedPost.upVoteUserIds,
    downVoteUserIds: updatedPost.downVoteUserIds
  }, { merge: true });
});
