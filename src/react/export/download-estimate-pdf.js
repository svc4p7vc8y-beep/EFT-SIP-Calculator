// Capture proposal blocks separately so long tables break only between rows.
export function inlineEstimateSvgPaint(root) {
  for (const svg of root.querySelectorAll('svg')) {
    for (const node of [svg, ...svg.querySelectorAll('*')]) {
      const computed = getComputedStyle(node);
      for (const property of ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'paint-order', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'vector-effect']) {
        const value = computed.getPropertyValue(property);
        if (value) node.style.setProperty(property, value);
      }
    }
  }
}

export async function downloadEstimatePdf(source, filename, { save = true } = {}) {
  if (!source) throw new Error('Не найден лист сметы для PDF.');
  const [{ jsPDF }, { toCanvas }] = await Promise.all([import('jspdf'), import('html-to-image')]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const margin = 10, pageWidth = 210, pageHeight = 297, contentWidth = pageWidth - margin * 2, bottom = pageHeight - margin;
  const captureWidth = 800, mmPerPixel = contentWidth / captureWidth;
  let y = margin;
  const holder = document.createElement('div');
  holder.className = `estimate-screen estimate-pdf-export ${source.closest('.estimate-screen')?.classList.contains('maximum-compact') ? 'maximum-compact' : ''} ${source.closest('.estimate-screen')?.classList.contains('super-compact') ? 'super-compact' : ''}`;
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${captureWidth}px;background:#fff;z-index:-1;`;
  const sheet = document.createElement('section'); sheet.className = 'print-sheet'; holder.append(sheet); document.body.append(holder);
  const newPage = () => { pdf.addPage(); y = margin; };
  const render = async node => {
    sheet.replaceChildren(node);
    // ForeignObject snapshots need explicit SVG paint to keep floor plans white.
    inlineEstimateSvgPaint(sheet);
    return toCanvas(sheet, { pixelRatio: 1.5, backgroundColor: '#fff', cacheBust: true, skipFonts: true });
  };
  const addCanvas = canvas => {
    const height = canvas.height / canvas.width * contentWidth;
    pdf.addImage(canvas.toDataURL('image/jpeg', .88), 'JPEG', margin, y, contentWidth, height, undefined, 'FAST');
    y += height + 2;
  };
  const addBlock = async node => {
    const canvas = await render(node);
    const height = canvas.height / canvas.width * contentWidth;
    if (height <= 0) return;
    if (height <= bottom - margin && y + height > bottom) newPage();
    if (height <= bottom - y) { addCanvas(canvas); return; }
    // Oversized diagrams or descriptions can still span pages; only tables
    // use the row-aware path below.
    let top = 0;
    const pixelsPerMm = canvas.width / contentWidth;
    while (top < canvas.height) {
      const availablePx = Math.floor((bottom - y) * pixelsPerMm);
      if (availablePx < 2) { newPage(); continue; }
      const sliceHeight = Math.min(canvas.height - top, availablePx);
      const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = sliceHeight;
      slice.getContext('2d').drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      pdf.addImage(slice.toDataURL('image/jpeg', .88), 'JPEG', margin, y, contentWidth, sliceHeight / pixelsPerMm, undefined, 'FAST');
      top += sliceHeight; y += sliceHeight / pixelsPerMm;
      if (top < canvas.height) newPage();
    }
    y += 2;
  };
  const addTableSection = async section => {
    const rows = [...section.querySelectorAll('tbody tr')];
    const totalValue = section.querySelector('tfoot tr td:last-child')?.textContent;
    if (!rows.length) { await addBlock(section.cloneNode(true)); return; }
    let offset = 0;
    while (offset < rows.length) {
      if (bottom - y < 42) newPage();
      const part = section.cloneNode(true);
      const body = part.querySelector('tbody');
      body.replaceChildren();
      part.querySelector('tfoot')?.remove();
      const total = document.createElement('div');
      total.className = 'pdf-section-total';
      total.innerHTML = `<span>Итого раздела</span><strong></strong>`;
      total.querySelector('strong').textContent = totalValue || '';
      if (totalValue) part.append(total);
      if (offset) {
        const heading = part.querySelector('h2');
        if (heading) heading.textContent += ' · продолжение';
      }
      sheet.replaceChildren(part);
      const availablePx = (bottom - y - 2) / mmPerPixel;
      let count = 0;
      while (offset + count < rows.length) {
        body.append(rows[offset + count].cloneNode(true));
        if (part.getBoundingClientRect().height <= availablePx) { count += 1; continue; }
        body.lastChild.remove();
        break;
      }
      if (!count) {
        if (y > margin) { newPage(); continue; }
        // A single unusually tall row remains readable on its own page.
        body.append(rows[offset].cloneNode(true));
        count = 1;
      }
      if (offset + count < rows.length) total.remove();
      const canvas = await render(part);
      const height = canvas.height / canvas.width * contentWidth;
      if (height > bottom - y && y > margin) { newPage(); continue; }
      addCanvas(canvas);
      offset += count;
      if (offset < rows.length) newPage();
    }
  };
  try {
    for (const child of source.children) {
      if (child.classList.contains('no-print') || child.classList.contains('estimate-source-ledger')) continue;
      if (child.classList.contains('print-only')) {
        for (const section of child.children) {
          if (section.querySelector('tbody tr')) await addTableSection(section);
          else await addBlock(section.cloneNode(true));
        }
      } else await addBlock(child.cloneNode(true));
    }
    const blob = pdf.output('blob');
    if (save) pdf.save(`${filename || 'Смета_ЭФТ'}.pdf`);
    return blob;
  } finally { holder.remove(); }
}
