// Capture the same proposal sections shown in print, then save an A4 PDF directly.
// Rendering one section at a time avoids browser canvas height limits on long estimates.
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

export async function downloadEstimatePdf(source, filename) {
  if (!source) throw new Error('Не найден лист сметы для PDF.');
  const [{ jsPDF }, { toCanvas }] = await Promise.all([import('jspdf'), import('html-to-image')]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const margin = 10, pageWidth = 210, pageHeight = 297, contentWidth = pageWidth - margin * 2, bottom = pageHeight - margin;
  let y = margin;
  const holder = document.createElement('div');
  holder.className = `estimate-screen estimate-pdf-export ${source.closest('.estimate-screen')?.classList.contains('maximum-compact') ? 'maximum-compact' : ''} ${source.closest('.estimate-screen')?.classList.contains('super-compact') ? 'super-compact' : ''}`;
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;background:#fff;z-index:-1;';
  const sheet = document.createElement('section'); sheet.className = 'print-sheet'; holder.append(sheet); document.body.append(holder);
  try {
    for (const child of source.children) {
      if (child.classList.contains('no-print') || child.classList.contains('estimate-source-ledger')) continue;
      sheet.replaceChildren(child.cloneNode(true));
      // html-to-image serializes nested SVGs inside a foreignObject. Without
      // explicit paint values, Chromium can turn CSS-styled plan polygons black.
      inlineEstimateSvgPaint(sheet);
      const canvas = await toCanvas(sheet, { pixelRatio: 1.5, backgroundColor: '#fff', cacheBust: true, skipFonts: true });
      const mmHeight = canvas.height / canvas.width * contentWidth;
      if (mmHeight <= 0) continue;
      if (y > margin && mmHeight < bottom - margin && y + mmHeight > bottom) { pdf.addPage(); y = margin; }
      let top = 0;
      const pixelsPerMm = canvas.width / contentWidth;
      while (top < canvas.height) {
        const availablePx = Math.floor((bottom - y) * pixelsPerMm);
        if (availablePx < 2) { pdf.addPage(); y = margin; continue; }
        const sliceHeight = Math.min(canvas.height - top, availablePx);
        const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = sliceHeight;
        slice.getContext('2d').drawImage(canvas, 0, top, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const heightMm = sliceHeight / pixelsPerMm;
        pdf.addImage(slice.toDataURL('image/jpeg', .88), 'JPEG', margin, y, contentWidth, heightMm, undefined, 'FAST');
        top += sliceHeight; y += heightMm;
        if (top < canvas.height) { pdf.addPage(); y = margin; }
      }
      y += 2;
    }
    pdf.save(`${filename || 'Смета_ЭФТ'}.pdf`);
  } finally { holder.remove(); }
}
