/**
 * 店舗マスタ
 * 新店舗を増やすときはここに1行追加し、layoutKey でレイアウトを指定します。
 */
const STORES = [
  { id: 'default', name: '145号店', layoutKey: 'standard' },
  // 例: { id: 'store-002', name: '2号店', layoutKey: 'standard' },
];

function getStoreById(storeId) {
  return STORES.find((s) => s.id === storeId) || STORES[0];
}

window.STORES = STORES;
window.getStoreById = getStoreById;
