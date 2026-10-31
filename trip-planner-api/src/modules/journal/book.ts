import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { gemini, STORY_MODEL } from '../../lib/ai';
import { UPLOAD_DIR } from '../../lib/upload';
import type { TripDoc } from '../trips/trip.model';
import type { JournalEntryDoc } from './journal.model';

/** A journal entry with its author and place names already populated. */
export type PopulatedEntry = Omit<JournalEntryDoc, 'author' | 'place'> & {
  author: { name: string };
  place: { name: string } | null;
};

export interface BookChapter {
  heading: string;
  subheading: string;
  text: string;
  /** Normalised JPEG buffers, ready to embed in a PDF or PPTX. */
  photos: Buffer[];
}

export interface StoryBook {
  title: string;
  subtitle: string;
  chapters: BookChapter[];
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Loads a photo (local upload or remote URL) and re-encodes it to a bounded JPEG. */
async function loadPhoto(url: string): Promise<Buffer | null> {
  try {
    let input: Buffer;
    if (url.startsWith('/uploads/')) {
      input = await fs.promises.readFile(path.join(UPLOAD_DIR, path.basename(url)));
    } else if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      input = Buffer.from(await res.arrayBuffer());
    } else {
      return null;
    }
    // sharp normalises WebP/AVIF/GIF/PNG to JPEG, which is what pdfkit and PPTX embed.
    return await sharp(input).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  } catch {
    return null; // a missing or unreadable photo is skipped, not fatal
  }
}

const chapterSchema = {
  type: 'object',
  properties: {
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string', description: 'A short, evocative chapter title for this day' },
          text: { type: 'string', description: 'Flowing narrative prose for this entry' },
        },
        required: ['heading', 'text'],
      },
    },
  },
  required: ['chapters'],
};

/**
 * Turns a trip's journal entries into a photo story book: Gemini writes one
 * narrative chapter per entry (read-only — nothing is persisted), and each
 * entry's photos are fetched and normalised alongside. The AI call and the
 * photo loading run concurrently.
 */
export async function buildStoryBook(trip: TripDoc, entries: PopulatedEntry[]): Promise<StoryBook> {
  const source = entries
    .map((e, i) => {
      const place = e.place?.name ? `, at ${e.place.name}` : '';
      const head = `[${i + 1}] ${fmtDate(e.date)} — ${e.author.name} (feeling ${e.mood})${place}${e.title ? ` — ${e.title}` : ''}`;
      return `${head}\n${e.body}`;
    })
    .join('\n\n');

  const prompt =
    `Here are the journal entries from a trip called "${trip.title}", in order.\n\n${source}\n\n` +
    `Write the trip as a story book with exactly ${entries.length} chapters, one per entry, in the same order. ` +
    'For each entry give a short evocative heading and warm, flowing narrative prose. Keep the real places, moods and who did what, ' +
    'and do not invent events that are not in the entries.';

  const [resp, photoLists] = await Promise.all([
    gemini().models.generateContent({
      model: STORY_MODEL,
      contents: prompt,
      config: {
        systemInstruction: 'You are a travel writer who turns a group trip journal into a vivid, heartfelt photo story book.',
        responseMimeType: 'application/json',
        responseJsonSchema: chapterSchema,
        maxOutputTokens: 8000,
      },
    }),
    Promise.all(entries.map((e) => Promise.all(e.photos.map(loadPhoto)).then((ps) => ps.filter((p): p is Buffer => p !== null)))),
  ]);

  let written: { heading: string; text: string }[] = [];
  try {
    written = (JSON.parse(resp.text ?? '{}').chapters ?? []) as { heading: string; text: string }[];
  } catch {
    written = []; // fall back to the raw entries below
  }

  const chapters: BookChapter[] = entries.map((e, i) => {
    const place = e.place?.name ? ` · ${e.place.name}` : '';
    return {
      heading: written[i]?.heading?.trim() || e.title || fmtDate(e.date),
      subheading: `${fmtDate(e.date)} · ${e.author.name}${place}`,
      text: written[i]?.text?.trim() || e.body,
      photos: photoLists[i],
    };
  });

  return {
    title: trip.title,
    subtitle: `${trip.destination} · ${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}`,
    chapters,
  };
}
