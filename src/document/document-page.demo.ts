import { DEFAULT_PAGE, pageCss, pageInches } from './document-page.ts';
console.log('Blank Letter portrait:', pageInches(DEFAULT_PAGE), pageCss(DEFAULT_PAGE));
console.log('Numbered A4 landscape:', pageCss({ ...DEFAULT_PAGE, size: 'a4', orientation: 'landscape', numbers: true }));
