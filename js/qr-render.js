/* global QRCode */
const QrRender = (function () {
  'use strict';

  async function toCanvas(canvas, text, size = 200) {
    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
      return QRCode.toCanvas(canvas, text, { width: size, margin: 2 });
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        resolve();
      };
      img.onerror = () => reject(new Error('QRの生成に失敗しました'));
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
    });
  }

  return { toCanvas };
})();
