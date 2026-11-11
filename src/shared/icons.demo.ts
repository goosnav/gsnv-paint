import { iconCatalog, renderIcon } from './icons.ts';

const sheet = document.querySelector('#sheet')!;
for (const name of iconCatalog) {
  const cell = document.createElement('section');
  const title = document.createElement('strong');
  title.textContent = name;
  const row = document.createElement('div');
  for (const size of [16, 24, 40]) row.append(renderIcon({ document, name, label: name, size }));
  cell.append(title, row);
  sheet.append(cell);
}
