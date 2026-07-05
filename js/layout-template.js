/**
 * 店内レイアウト定義（店舗ごとに layoutKey で切り替え）
 */
const LAYOUT_STANDARD = {
  version: 5,
  peripheral: [
    { slotKey: 'chilled', defaultName: 'チルド', zone: 'entrance' },
    { slotKey: 'walkin', defaultName: 'ウォークイン', zone: 'walkin' },
    { slotKey: 'register', defaultName: 'レジ', zone: 'register' },
    { slotKey: 'bookshelf', defaultName: '本棚', zone: 'bookshelf' },
  ],
  rows: [
    {
      id: 'row1',
      label: '上の棚列',
      gridCols: 9,
      cells: [
        { slotKey: 's-1', defaultName: '1', col: 1, rowStart: 1, rowEnd: 3 },
        { slotKey: 's-2', defaultName: '2', col: 2, row: 1 },
        { slotKey: 's-3', defaultName: '3', col: 3, row: 1 },
        { slotKey: 's-4', defaultName: '4', col: 4, row: 1 },
        { slotKey: 's-5', defaultName: '5', col: 5, row: 1 },
        { slotKey: 's-6', defaultName: '6 冷凍', col: 6, colSpan: 4, row: 1, freezer: true },
        { slotKey: 's-7', defaultName: '7', col: 2, row: 2 },
        { slotKey: 's-8', defaultName: '8', col: 3, row: 2 },
        { slotKey: 's-9', defaultName: '9', col: 4, row: 2 },
        { slotKey: 's-10', defaultName: '10', col: 5, row: 2 },
        { slotKey: 's-11', defaultName: '11 冷凍', col: 6, colSpan: 4, row: 2, freezer: true },
      ],
    },
    {
      id: 'row2',
      label: '中央の棚列',
      gridCols: 10,
      cells: [
        { slotKey: 's-12', defaultName: '12', col: 1, rowStart: 1, rowEnd: 3 },
        { slotKey: 's-13', defaultName: '13', col: 2, row: 1 },
        { slotKey: 's-14', defaultName: '14', col: 3, row: 1 },
        { slotKey: 's-15', defaultName: '15', col: 4, row: 1 },
        { slotKey: 's-16', defaultName: '16', col: 5, row: 1 },
        { slotKey: 's-17', defaultName: '17', col: 6, row: 1 },
        { slotKey: 's-18', defaultName: '18', col: 7, row: 1 },
        { slotKey: 's-19', defaultName: '19 冷凍', col: 8, colSpan: 2, row: 1, freezer: true },
        { slotKey: 's-20', defaultName: '20', col: 2, row: 2 },
        { slotKey: 's-21', defaultName: '21', col: 3, row: 2 },
        { slotKey: 's-22', defaultName: '22', col: 4, row: 2 },
        { slotKey: 's-23', defaultName: '23', col: 5, row: 2 },
        { slotKey: 's-24', defaultName: '24', col: 6, row: 2 },
        { slotKey: 's-25', defaultName: '25', col: 7, row: 2 },
        { slotKey: 's-26', defaultName: '26 冷凍', col: 8, colSpan: 2, row: 2, freezer: true },
        { slotKey: 's-27', defaultName: '102', col: 10, rowStart: 1, rowEnd: 3 },
      ],
    },
    {
      id: 'row3',
      label: '下の棚列',
      gridCols: 12,
      cells: [
        { slotKey: 's-28', defaultName: '28', col: 1, rowStart: 1, rowEnd: 3 },
        { slotKey: 's-29', defaultName: '29', col: 2, row: 1 },
        { slotKey: 's-30', defaultName: '30', col: 3, row: 1 },
        { slotKey: 's-31', defaultName: '31', col: 4, row: 1 },
        { slotKey: 's-32', defaultName: '32', col: 5, row: 1 },
        { slotKey: 's-33', defaultName: '33', col: 6, row: 1 },
        { slotKey: 's-34', defaultName: '34', col: 7, row: 1 },
        { slotKey: 's-35', defaultName: '35', col: 8, row: 1 },
        { slotKey: 's-36', defaultName: '36', col: 9, row: 1 },
        { slotKey: 's-37', defaultName: '37', col: 10, row: 1 },
        { slotKey: 's-38', defaultName: '38', col: 11, row: 1 },
        { slotKey: 's-39', defaultName: '39', col: 2, row: 2 },
        { slotKey: 's-40', defaultName: '40', col: 3, row: 2 },
        { slotKey: 's-41', defaultName: '41', col: 4, row: 2 },
        { slotKey: 's-42', defaultName: '42', col: 5, row: 2 },
        { slotKey: 's-43', defaultName: '43', col: 6, row: 2 },
        { slotKey: 's-44', defaultName: '44', col: 7, row: 2 },
        { slotKey: 's-45', defaultName: '45', col: 8, row: 2 },
        { slotKey: 's-46', defaultName: '46', col: 9, row: 2 },
        { slotKey: 's-47', defaultName: '47', col: 10, row: 2 },
        { slotKey: 's-48', defaultName: '48', col: 11, row: 2 },
        { slotKey: 's-49', defaultName: '101', col: 12, rowStart: 1, rowEnd: 3 },
      ],
    },
  ],
};

const LAYOUT_REGISTRY = {
  standard: LAYOUT_STANDARD,
};

/** @deprecated 互換用。getLayoutForStore を使ってください */
const LAYOUT_TEMPLATE = LAYOUT_STANDARD;

function getLayoutForStore(storeId) {
  const store = getStoreById(storeId);
  return LAYOUT_REGISTRY[store.layoutKey] || LAYOUT_STANDARD;
}

function getAllSlotsFromLayout(layout) {
  const slots = [];

  for (const p of layout.peripheral) {
    slots.push({ slotKey: p.slotKey, defaultName: p.defaultName, zone: p.zone });
  }

  for (const row of layout.rows) {
    for (const cell of row.cells) {
      slots.push({
        slotKey: cell.slotKey,
        defaultName: cell.defaultName,
        zone: 'aisle',
        rowId: row.id,
      });
    }
  }

  return slots;
}

function getAllSlotsForStore(storeId) {
  return getAllSlotsFromLayout(getLayoutForStore(storeId));
}

function getAllSlots() {
  return getAllSlotsForStore('default');
}

window.LAYOUT_STANDARD = LAYOUT_STANDARD;
window.LAYOUT_REGISTRY = LAYOUT_REGISTRY;
window.LAYOUT_TEMPLATE = LAYOUT_TEMPLATE;
window.getLayoutForStore = getLayoutForStore;
window.getAllSlotsFromLayout = getAllSlotsFromLayout;
window.getAllSlotsForStore = getAllSlotsForStore;
window.getAllSlots = getAllSlots;
