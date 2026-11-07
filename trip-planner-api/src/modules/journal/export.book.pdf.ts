import PDFDocument from 'pdfkit';
import type { Writable } from 'node:stream';
import type { StoryBook } from './book';

const INK = '#1f2937';
const MUTED = '#6b7280';
const ACCENT = '#0f766e';

const PAGE_TOP = 50;
const PAGE_BOTTOM = 790;
const CONTENT_W = 495; // A4 width (595) minus 50pt margins

/** Streams a trip story book (cover + one chapter per entry, with photos) as a PDF. */
export function renderStoryBookPdf(book: StoryBook, out: Writable) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `${book.title} - story`, Author: 'Trip Planner' } });
  doc.pipe(out);

  // Cover
  doc.moveDown(6);
  doc.fillColor(ACCENT).fontSize(11).font('Helvetica').text('TRIP PLANNER · A TRAVEL STORY', { characterSpacing: 1, align: 'center' });
  doc.moveDown(1.5);
  doc.fillColor(INK).fontSize(34).font('Helvetica-Bold').text(book.title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fillColor(MUTED).fontSize(13).font('Helvetica').text(book.subtitle, { align: 'center' });

  for (const chapter of book.chapters) {
    doc.addPage();
    doc.fillColor(ACCENT).fontSize(18).font('Helvetica-Bold').text(chapter.heading);
    doc.moveDown(0.2);
    doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(chapter.subheading);
    doc.moveDown(0.6);
    doc.fillColor(INK).fontSize(11.5).font('Helvetica').text(chapter.text, { align: 'justify', lineGap: 2 });

    if (chapter.photos.length) {
      doc.moveDown(1);
      const gap = 12;
      const w = (CONTENT_W - gap) / 2; // two photos per row
      const h = w * 0.72;
      let rowY = doc.y;
      chapter.photos.forEach((photo, i) => {
        const col = i % 2;
        if (col === 0 && rowY + h > PAGE_BOTTOM) {
          doc.addPage();
          rowY = PAGE_TOP;
        }
        const x = 50 + col * (w + gap);
        try {
          doc.image(photo, x, rowY, { fit: [w, h], align: 'center', valign: 'center' });
        } catch {
          // skip an image pdfkit cannot decode
        }
        if (col === 1 || i === chapter.photos.length - 1) {
          rowY += h + gap;
          doc.y = rowY;
        }
      });
    }
  }

  doc.end();
}
