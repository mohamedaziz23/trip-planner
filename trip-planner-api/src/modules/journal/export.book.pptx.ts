import PptxGenJS from 'pptxgenjs';
import type { StoryBook } from './book';

const INK = '1F2937';
const MUTED = '6B7280';
const ACCENT = '0F766E';
const PAPER = 'FFFFFF';

const dataUri = (photo: Buffer) => `image/jpeg;base64,${photo.toString('base64')}`;

/** Builds a trip story book (title slide + one slide per entry) as a .pptx buffer. */
export async function renderStoryBookPptx(book: StoryBook): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.author = 'Trip Planner';
  pptx.title = `${book.title} - story`;
  const W = 13.33;

  // Title slide
  const cover = pptx.addSlide();
  cover.background = { color: PAPER };
  cover.addText('TRIP PLANNER · A TRAVEL STORY', { x: 0, y: 2.3, w: W, h: 0.4, align: 'center', fontSize: 13, color: ACCENT, charSpacing: 2 });
  cover.addText(book.title, { x: 0.5, y: 2.9, w: W - 1, h: 1.2, align: 'center', fontSize: 40, bold: true, color: INK });
  cover.addText(book.subtitle, { x: 0.5, y: 4.1, w: W - 1, h: 0.6, align: 'center', fontSize: 16, color: MUTED });

  for (const chapter of book.chapters) {
    const slide = pptx.addSlide();
    slide.background = { color: PAPER };
    slide.addText(chapter.heading, { x: 0.5, y: 0.35, w: W - 1, h: 0.7, fontSize: 26, bold: true, color: ACCENT });
    slide.addText(chapter.subheading, { x: 0.5, y: 1.05, w: W - 1, h: 0.4, fontSize: 12, color: MUTED });

    const photos = chapter.photos.slice(0, 4);
    const hasPhotos = photos.length > 0;
    const textW = hasPhotos ? 6.3 : W - 1;
    slide.addText(chapter.text, { x: 0.5, y: 1.6, w: textW, h: 5.4, fontSize: 13, color: INK, align: 'left', valign: 'top', lineSpacingMultiple: 1.1, fit: 'shrink' });

    if (hasPhotos) {
      // 2x2 grid on the right half
      const gx = 7.1;
      const gy = 1.6;
      const cw = 2.85;
      const ch = 2.55;
      const gap = 0.2;
      photos.forEach((photo, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        slide.addImage({ data: dataUri(photo), x: gx + col * (cw + gap), y: gy + row * (ch + gap), w: cw, h: ch, sizing: { type: 'contain', w: cw, h: ch } });
      });
    }
  }

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
