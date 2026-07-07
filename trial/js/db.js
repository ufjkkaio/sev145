/* trial 専用 DB 拡張（本番 js/ は触らない） */
window.DB = Object.assign({}, CloudDB, {
  async movePhoto(photoId, targetShelfId) {
    const photo = await CloudDB.getPhoto(photoId);
    if (!photo) throw new Error('写真が見つかりません');
    const target = Number(targetShelfId);
    if (photo.shelfId === target) return;
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
});
