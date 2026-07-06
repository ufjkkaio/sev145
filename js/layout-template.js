/**
 * 145号店 店内レイアウト定義（v6: 周囲棚48〜70を追加）
 */
const LAYOUT_TEMPLATE = {
  version: 6,
  zones: [
    { slotKey: 'chilled', defaultName: 'チルド', placement: 'entrance' },
    { slotKey: 'walkin', defaultName: 'ウォークイン', placement: 'left' },
    { slotKey: 'register', defaultName: 'レジ', placement: 'right' },
    { slotKey: 'bookshelf', defaultName: '本棚', placement: 'footer' },
  ],
  topPerimeter: {
    leading: { slotKey: 's-48', defaultName: '48' },
    cells: [
      { slotKey: 's-50', defaultName: '49' },
      { slotKey: 's-51', defaultName: '50' },
      { slotKey: 's-52', defaultName: '51' },
      { gap: true },
      { slotKey: 's-53', defaultName: '52' },
      { slotKey: 's-54', defaultName: '53' },
      { slotKey: 's-55', defaultName: '54' },
      { slotKey: 's-56', defaultName: '55' },
      { slotKey: 's-57', defaultName: '56' },
      { slotKey: 's-58', defaultName: '57' },
      { slotKey: 's-59', defaultName: '58' },
    ],
  },
  leftPerimeter: [
    { slotKey: 's-60', defaultName: '59' },
    { slotKey: 's-61', defaultName: '60' },
    { slotKey: 's-62', defaultName: '61' },
    { slotKey: 's-63', defaultName: '62' },
    { slotKey: 's-64', defaultName: '63' },
    { slotKey: 's-65', defaultName: '64' },
    { slotKey: 's-66', defaultName: '65' },
  ],
  bottomPerimeter: [
    { slotKey: 's-67', defaultName: '66' },
    { slotKey: 's-68', defaultName: '67' },
    { slotKey: 's-69', defaultName: '68' },
    { slotKey: 's-70', defaultName: '69' },
    { slotKey: 's-71', defaultName: '70' },
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
      gridCols: 11,
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
        { slotKey: 's-38', defaultName: '38', col: 2, row: 2 },
        { slotKey: 's-39', defaultName: '39', col: 3, row: 2 },
        { slotKey: 's-40', defaultName: '40', col: 4, row: 2 },
        { slotKey: 's-41', defaultName: '41', col: 5, row: 2 },
        { slotKey: 's-42', defaultName: '42', col: 6, row: 2 },
        { slotKey: 's-43', defaultName: '43', col: 7, row: 2 },
        { slotKey: 's-44', defaultName: '44', col: 8, row: 2 },
        { slotKey: 's-45', defaultName: '45', col: 9, row: 2 },
        { slotKey: 's-46', defaultName: '46', col: 10, row: 2 },
        { slotKey: 's-49', defaultName: '101', col: 11, rowStart: 1, rowEnd: 3 },
      ],
    },
  ],
};

function getAllSlots() {
  const slots = [];

  for (const z of LAYOUT_TEMPLATE.zones) {
    slots.push({ slotKey: z.slotKey, defaultName: z.defaultName, zone: z.placement });
  }

  const { topPerimeter, leftPerimeter, bottomPerimeter } = LAYOUT_TEMPLATE;
  slots.push({
    slotKey: topPerimeter.leading.slotKey,
    defaultName: topPerimeter.leading.defaultName,
    zone: 'perimeter-top',
  });
  for (const cell of topPerimeter.cells) {
    if (!cell.gap) {
      slots.push({ slotKey: cell.slotKey, defaultName: cell.defaultName, zone: 'perimeter-top' });
    }
  }
  for (const cell of leftPerimeter) {
    slots.push({ slotKey: cell.slotKey, defaultName: cell.defaultName, zone: 'perimeter-left' });
  }
  for (const cell of bottomPerimeter) {
    slots.push({ slotKey: cell.slotKey, defaultName: cell.defaultName, zone: 'perimeter-bottom' });
  }

  for (const row of LAYOUT_TEMPLATE.rows) {
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

window.LAYOUT_TEMPLATE = LAYOUT_TEMPLATE;
window.getAllSlots = getAllSlots;
