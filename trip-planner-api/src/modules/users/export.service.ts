import path from 'node:path';
import type { Writable } from 'node:stream';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { durationInDays } from '../../lib/countries';
import type { Place } from '../places/place.model';
import type { TripDoc } from '../trips/trip.model';

/**
 * Module 1 advanced feature — itinerary export as PDF, rendered server side.
 *
 * - summary block: destination, dates, travellers, preferences, budget, figures
 * - QR code to the public share link when the owner enabled it
 * - publicView (PDF downloaded from the share page): budget and costs are left out
 * - day-by-day table (time, place, category, duration, estimated cost) with the
 *   same day colours as the map, per-day totals, free days, unscheduled places
 * - header and "Page x / y" footer on every page, Unicode font (DejaVu Sans)
 */

type ExportPlace = Place & { _id: unknown };

const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const FONT = 'DejaVu';
const FONT_BOLD = 'DejaVu-Bold';
const FONT_ITALIC = 'DejaVu-Oblique';

const INK = '#1f2937';
const MUTED = '#4b5563';
const LINE = '#e5e7eb';
const ACCENT = '#0f766e';
const ACCENT_DARK = '#115e59';
const SOFT = '#f0fdfa';
// same palette as the itinerary map (trip-planner-web/src/lib/constants.ts)
const DAY_COLORS = ['#0f766e', '#b45309', '#7c3aed', '#be123c', '#1d4ed8', '#15803d', '#a21caf', '#c2410c', '#0369a1', '#4d7c0f'];
const dayColor = (day: number) => DAY_COLORS[(day - 1) % DAY_COLORS.length]!;

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const CONTENT_W = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - PAGE.margin - 24; // keep room for the footer

// table columns (x offset from the left margin, width)
const COLS = {
  time: { x: 0, w: 46 },
  place: { x: 50, w: 263 },
  category: { x: 317, w: 70 },
  duration: { x: 391, w: 52 },
  cost: { x: 447, w: CONTENT_W - 447 },
};

const DAY_MS = 24 * 3600 * 1000;

function fmtDate(d: Date, withWeekday = true) {
  return d.toLocaleDateString('en-GB', {
    ...(withWeekday && { weekday: 'long' }),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtDuration(min: number) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function exportFilename(trip: TripDoc) {
  const slug = trip.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${slug || 'trip'}-itinerary.pdf`;
}

/** Public URL of the read-only share page, or null when the owner has not enabled it. */
export function shareUrl(trip: TripDoc) {
  return trip.shareToken ? `${env.clientOrigin.replace(/\/$/, '')}/share/${trip.shareToken}` : null;
}

export interface ExportOptions {
  /** true for the PDF downloaded through a public share link: no budget, no costs */
  publicView: boolean;
}

export async function renderTripPdf(trip: TripDoc, places: ExportPlace[], out: Writable, { publicView }: ExportOptions) {
  const showCosts = !publicView;
  const link = shareUrl(trip);
  const qr = link ? await QRCode.toBuffer(link, { margin: 1, width: 240, color: { dark: ACCENT_DARK, light: '#ffffff' } }) : null;

  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    bufferPages: true, // footers are written once the page count is known
    info: { Title: `${trip.title} — itinerary`, Author: 'Trip Planner', Subject: `${trip.destination} trip itinerary` },
  });
  doc.registerFont(FONT, path.join(FONT_DIR, 'DejaVuSans.ttf'));
  doc.registerFont(FONT_BOLD, path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
  doc.registerFont(FONT_ITALIC, path.join(FONT_DIR, 'DejaVuSans-Oblique.ttf'));
  doc.pipe(out);

  const left = PAGE.margin;
  const days = durationInDays(trip.startDate, trip.endDate);
  const members = trip.members.map((m) => (m.user as unknown as { name?: string })?.name).filter(Boolean) as string[];
  const scheduled = places.filter((p) => p.day);
  const plannedCost = places.reduce((s, p) => s + (p.estimatedCost ?? 0), 0);

  // ------------------------------------------------------------------ summary block
  const bandH = 96;
  doc.rect(0, 0, PAGE.width, bandH).fill(ACCENT);
  doc.font(FONT_BOLD).fontSize(8).fillColor('#99f6e4').text('TRIP PLANNER  ·  ITINERARY', left, 26, { characterSpacing: 1.2 });
  doc.font(FONT_BOLD).fontSize(22).fillColor('#ffffff').text(trip.title, left, 40, { width: CONTENT_W - (qr ? 0 : 0), lineBreak: false, ellipsis: true });
  doc.font(FONT).fontSize(10).fillColor('#ccfbf1').text(`${trip.destination}, ${trip.country}  ·  ${days} day${days > 1 ? 's' : ''}`, left, 70);

  let y = bandH + 18;
  const infoW = qr ? CONTENT_W - 130 : CONTENT_W;
  const prefs = trip.preferences;
  const travellers = prefs?.travellers;
  const travellerText = travellers
    ? [
        `${travellers.adults} adult${travellers.adults === 1 ? '' : 's'}`,
        travellers.children ? `${travellers.children} child${travellers.children === 1 ? '' : 'ren'}` : '',
        travellers.infants ? `${travellers.infants} infant${travellers.infants === 1 ? '' : 's'}` : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  const rows: [string, string][] = [
    ['Dates', `${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}`],
    ['Participants', members.join(', ') || '—'],
    ['Travellers', travellerText || '—'],
    ['Trip style', prefs ? [capitalize(prefs.tripType ?? ''), prefs.accommodation, `by ${prefs.transport}`].filter(Boolean).join(' · ') : '—'],
    ['Activities', prefs?.activities?.length ? prefs.activities.map(capitalize).join(', ') : '—'],
    ...(showCosts ? [['Budget', trip.budget ? fmtMoney(trip.budget, trip.baseCurrency) : 'No budget set'] as [string, string]] : []),
  ];
  for (const [label, value] of rows) {
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(MUTED).text(label.toUpperCase(), left, y, { width: 82, characterSpacing: 0.4 });
    doc.font(FONT).fontSize(10).fillColor(INK).text(value, left + 86, y - 1, { width: infoW - 86 });
    y = doc.y + 5;
  }

  if (qr) {
    const qx = left + CONTENT_W - 112;
    const qy = bandH + 14;
    doc.roundedRect(qx - 6, qy - 6, 124, 150, 8).fill(SOFT);
    doc.image(qr, qx, qy, { width: 112, height: 112 });
    doc.font(FONT_BOLD).fontSize(7.5).fillColor(ACCENT_DARK).text('Scan for the live itinerary', qx - 4, qy + 116, { width: 120, align: 'center' });
    doc.font(FONT).fontSize(6).fillColor(MUTED).text('Read-only link, no account needed', qx - 4, qy + 127, { width: 120, align: 'center' });
    y = Math.max(y, qy + 152);
  }

  // key figures
  y += 8;
  const figures: [string, string][] = [
    [String(days), days > 1 ? 'days' : 'day'],
    [String(places.length), places.length === 1 ? 'place' : 'places'],
    [`${scheduled.length}/${places.length}`, 'scheduled'],
    showCosts
      ? [plannedCost ? fmtMoney(plannedCost, trip.baseCurrency) : '—', 'planned visits cost']
      : [String(members.length), members.length === 1 ? 'participant' : 'participants'],
  ];
  const boxW = (CONTENT_W - 3 * 8) / 4;
  figures.forEach(([value, label], i) => {
    const x = left + i * (boxW + 8);
    doc.roundedRect(x, y, boxW, 44, 6).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.font(FONT_BOLD).fontSize(14).fillColor(ACCENT_DARK).text(value, x, y + 7, { width: boxW, align: 'center', lineBreak: false, ellipsis: true });
    doc.font(FONT).fontSize(7.5).fillColor(MUTED).text(label, x, y + 27, { width: boxW, align: 'center' });
  });
  y += 60;

  // ------------------------------------------------------------------ itinerary
  doc.y = y;
  const ensureSpace = (needed: number) => {
    if (doc.y + needed > BOTTOM) {
      doc.addPage();
      doc.y = PAGE.margin + 18;
    }
  };

  const tableHeader = () => {
    const hy = doc.y;
    doc.rect(left, hy, CONTENT_W, 18).fill('#f3f4f6');
    doc.font(FONT_BOLD).fontSize(7.5).fillColor(MUTED);
    doc.text('TIME', left + COLS.time.x + 4, hy + 5, { width: COLS.time.w });
    doc.text('PLACE', left + COLS.place.x, hy + 5, { width: COLS.place.w });
    doc.text('CATEGORY', left + COLS.category.x, hy + 5, { width: COLS.category.w });
    doc.text('DURATION', left + COLS.duration.x, hy + 5, { width: COLS.duration.w });
    if (showCosts) doc.text('EST. COST', left + COLS.cost.x, hy + 5, { width: COLS.cost.w - 4, align: 'right' });
    doc.y = hy + 22;
  };

  const placeRowHeight = (p: ExportPlace) => {
    doc.font(FONT_BOLD).fontSize(9.5);
    let h = doc.heightOfString(p.name, { width: COLS.place.w });
    doc.font(FONT).fontSize(8);
    if (p.address) h += doc.heightOfString(p.address, { width: COLS.place.w }) + 1;
    if (p.notes) h += doc.heightOfString(p.notes, { width: COLS.place.w }) + 2;
    return h + 8;
  };

  doc.font(FONT_BOLD).fontSize(14).fillColor(INK).text('Day-by-day itinerary', left, doc.y);
  doc.moveDown(0.5);

  const byDay = new Map<number, ExportPlace[]>();
  for (const p of scheduled) {
    if (!byDay.has(p.day!)) byDay.set(p.day!, []);
    byDay.get(p.day!)!.push(p);
  }
  for (const list of byDay.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (let day = 1; day <= days; day++) {
    const list = byDay.get(day) ?? [];
    const date = new Date(trip.startDate.getTime() + (day - 1) * DAY_MS);
    // keep the day title with its table header and first row
    ensureSpace(30 + 22 + (list[0] ? placeRowHeight(list[0]) : 16));

    const ty = doc.y;
    doc.circle(left + 10, ty + 9, 10).fill(dayColor(day));
    doc.font(FONT_BOLD).fontSize(9).fillColor('#ffffff').text(String(day), left, ty + 4.5, { width: 20, align: 'center' });
    doc.font(FONT_BOLD).fontSize(12).fillColor(INK).text(`Day ${day}`, left + 28, ty + 2, { continued: true });
    doc.font(FONT).fontSize(10).fillColor(MUTED).text(`   ${fmtDate(date)}`);
    doc.y = ty + 26;

    if (!list.length) {
      doc.font(FONT_ITALIC).fontSize(9).fillColor(MUTED).text('Free day — nothing planned yet.', left + 28, doc.y);
      doc.y += 14;
      continue;
    }

    tableHeader();
    for (const p of list) {
      const h = placeRowHeight(p);
      if (doc.y + h > BOTTOM) {
        doc.addPage();
        doc.y = PAGE.margin + 18;
        doc.font(FONT_ITALIC).fontSize(8).fillColor(MUTED).text(`Day ${day} (continued)`, left, doc.y);
        doc.y += 4;
        tableHeader();
      }
      const ry = doc.y;
      doc.rect(left, ry - 2, 3, h - 4).fill(dayColor(day));
      doc.font(FONT_BOLD).fontSize(9).fillColor(INK).text(p.startTime ?? '—', left + COLS.time.x + 8, ry, { width: COLS.time.w - 4 });
      doc.font(FONT_BOLD).fontSize(9.5).fillColor(INK).text(p.name, left + COLS.place.x, ry, { width: COLS.place.w });
      doc.font(FONT).fontSize(8).fillColor(MUTED);
      if (p.address) doc.text(p.address, left + COLS.place.x, doc.y + 1, { width: COLS.place.w });
      if (p.notes) doc.font(FONT_ITALIC).fillColor(INK).text(p.notes, left + COLS.place.x, doc.y + 2, { width: COLS.place.w });
      doc.font(FONT).fontSize(8.5).fillColor(MUTED).text(capitalize(p.category ?? ''), left + COLS.category.x, ry + 1, { width: COLS.category.w });
      doc.text(fmtDuration(p.durationMin ?? 0), left + COLS.duration.x, ry + 1, { width: COLS.duration.w });
      if (showCosts) doc.text(p.estimatedCost ? fmtMoney(p.estimatedCost, trip.baseCurrency) : '—', left + COLS.cost.x, ry + 1, { width: COLS.cost.w - 4, align: 'right' });
      doc.y = ry + h;
      doc.moveTo(left, doc.y - 4).lineTo(left + CONTENT_W, doc.y - 4).lineWidth(0.5).strokeColor(LINE).stroke();
    }

    const visits = list.reduce((s, p) => s + (p.durationMin ?? 0), 0);
    const cost = list.reduce((s, p) => s + (p.estimatedCost ?? 0), 0);
    doc.font(FONT).fontSize(8).fillColor(MUTED).text(
      `${list.length} stop${list.length > 1 ? 's' : ''}  ·  ${fmtDuration(visits)} of visits${showCosts && cost ? `  ·  ${fmtMoney(cost, trip.baseCurrency)} estimated` : ''}`,
      left,
      doc.y,
      { width: CONTENT_W, align: 'right' },
    );
    doc.y += 14;
  }

  // ------------------------------------------------------------------ unscheduled places
  const unscheduled = places.filter((p) => !p.day);
  if (unscheduled.length) {
    ensureSpace(60);
    doc.font(FONT_BOLD).fontSize(12).fillColor(INK).text('Not scheduled yet', left, doc.y);
    doc.moveDown(0.3);
    for (const p of unscheduled) {
      ensureSpace(28);
      doc.font(FONT_BOLD).fontSize(9.5).fillColor(INK).text(`•  ${p.name}`, left + 6, doc.y, { width: CONTENT_W - 6 });
      const meta = [p.address, p.durationMin ? fmtDuration(p.durationMin) : '', showCosts && p.estimatedCost ? fmtMoney(p.estimatedCost, trip.baseCurrency) : '']
        .filter(Boolean)
        .join('  ·  ');
      if (meta) doc.font(FONT).fontSize(8).fillColor(MUTED).text(meta, left + 18, doc.y, { width: CONTENT_W - 18 });
      doc.y += 4;
    }
  }

  if (!places.length) {
    doc.font(FONT_ITALIC).fontSize(10).fillColor(MUTED).text('No places have been added to this trip yet.', left, doc.y + 6);
  }

  // ------------------------------------------------------------------ header + footer on every page
  const exportedOn = fmtDate(new Date(), false);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // writing inside the margins would make pdfkit add a new page: lift them for the header/footer
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;
    const footerY = PAGE.height - PAGE.margin + 6;
    doc.moveTo(left, footerY - 6).lineTo(left + CONTENT_W, footerY - 6).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font(FONT).fontSize(7.5).fillColor(MUTED);
    doc.text(`${trip.title}  ·  ${publicView ? 'shared itinerary' : 'exported'} on ${exportedOn}`, left, footerY, { width: CONTENT_W - 80, lineBreak: false, ellipsis: true });
    doc.text(`Page ${i - range.start + 1} / ${range.count}`, left + CONTENT_W - 80, footerY, { width: 80, align: 'right', lineBreak: false });
    if (i > range.start) {
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(ACCENT).text('TRIP PLANNER', left, PAGE.margin - 22, { lineBreak: false, characterSpacing: 1 });
      doc.font(FONT).fillColor(MUTED).text(trip.title, left + 80, PAGE.margin - 22, { width: CONTENT_W - 80, align: 'right', lineBreak: false, ellipsis: true });
    }
  }
  doc.end();
}
