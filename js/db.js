/* 145号店はクラウド専用（IndexedDB廃止） */
window.DB = Object.assign({}, CloudDB, {
  async movePhoto(photoId, targetShelfId) {
    const photo = await CloudDB.getPhoto(photoId);
    if (!photo) throw new Error('写真が見つかりません');
    const target = Number(targetShelfId);
    if (Number(photo.shelfId) === target) return;
    if (!photo.storagePath) throw new Error('写真データが不完全です');
    photo.shelfId = target;
    delete photo.url;
    delete photo.blob;
    await CloudDB.updatePhoto(photo);
  },

  async moveAllPhotos(fromShelfId, toShelfId) {
    const from = Number(fromShelfId);
    const to = Number(toShelfId);
    if (from === to) return 0;
    const photos = await CloudDB.getPhotosByShelf(from);
    for (const photo of photos) {
      photo.shelfId = to;
      delete photo.url;
      delete photo.blob;
      await CloudDB.updatePhoto(photo);
    }
    return photos.length;
  },

  async movePhotos(photoIds, targetShelfId) {
    let count = 0;
    for (const photoId of photoIds) {
      await this.movePhoto(photoId, targetShelfId);
      count += 1;
    }
    return count;
  },

  async deletePhotos(photoIds) {
    for (const photoId of photoIds) {
      await CloudDB.deletePhoto(photoId);
    }
    return photoIds.length;
  },
});
