import PDFDocument from 'pdfkit';
import type { Writable } from 'node:stream';
import { durationInDays } from '../../lib/countries';
import type { Place } from '../places/place.model';
import type { TripDoc } from './trip.model';

const INK = '#1f2937';
const MUTED = '#6b7280';
const ACCENT = '#0f766e';

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtDuration(min: number) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
}

/** Streams the full itinerary of a trip as a PDF (server-side rendering). */
export function renderTripPdf(trip: TripDoc, places: (Place & { _id: unknown })[], out: Writable) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `${trip.title} - itinerary`, Author: 'Trip Planner' } });
  doc.pipe(out);

  const days = durationInDays(trip.startDate, trip.endDate);
  const members = trip.members
    .map((m) => (m.user as unknown as { name?: string })?.name)
    .filter(Boolean)
    .join(', ');

  // Header
  doc.fillColor(ACCENT).fontSize(10).text('TRIP PLANNER · ITINERARY', { characterSpacing: 1 });
  doc.moveDown(0.3);
  doc.fillColor(INK).fontSize(24).font('Helvetica-Bold').text(trip.title);
  doc.font('Helvetica').fontSize(12).fillColor(MUTED);
  doc.text(`${trip.destination} (${trip.country}) · ${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)} · ${days} day${days > 1 ? 's' : ''}`);
  if (trip.budget) doc.text(`Budget: ${trip.budget.toLocaleString('en-GB')} ${trip.baseCurrency}`);
  if (members) doc.text(`Travellers: ${members}`);
  doc.moveDown();
  doc.strokeColor('#e5e7eb').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  const byDay = new Map<number | null, typeof places>();
  for (const p of places) {
    const key = p.day ?? null;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(p);
  }

  for (let day = 1; day <= days; day++) {
    const list = byDay.get(day) ?? [];
    const date = new Date(trip.startDate.getTime() + (day - 1) * 24 * 3600 * 1000);
    if (doc.y > 700) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT).text(`Day ${day}`, { continued: true });
    doc.font('Helvetica').fillColor(MUTED).fontSize(11).text(`   ${fmtDate(date)}`);
    doc.moveDown(0.3);
    if (!list.length) {
      doc.fontSize(10).fillColor(MUTED).text('Free day - nothing planned yet.');
    }
    for (const p of list) {
      if (doc.y > 740) doc.addPage();
      const time = p.startTime ? `${p.startTime}  ` : '';
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(`${time}${p.name}`);
      const meta = [p.category, fmtDuration(p.durationMin ?? 0), p.estimatedCost ? `~${p.estimatedCost} ${trip.baseCurrency}` : '']
        .filter(Boolean)
        .join(' · ');
      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      if (p.address) doc.text(p.address);
      if (meta) doc.text(meta);
      if (p.notes) doc.fillColor(INK).text(p.notes);
      doc.moveDown(0.4);
    }
    doc.moveDown(0.6);
  }

  const unscheduled = byDay.get(null) ?? [];
  if (unscheduled.length) {
    if (doc.y > 680) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT).text('Not scheduled yet');
    doc.moveDown(0.3);
    for (const p of unscheduled) {
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(`• ${p.name}${p.address ? ` – ${p.address}` : ''}`);
    }
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor(MUTED).text(`Generated on ${fmtDate(new Date())}`, { align: 'right' });
  doc.end();
}
