/**
 * Excel and PDF reports (Vietnamese). PDF uses Roboto from pdfmake's bundled
 * VFS, which includes full Vietnamese glyph coverage.
 */
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { CompetencyLevel } from '@solar/shared';
import type { Bucket } from './scoring';
import type { serializeResultRow, analytics } from './analytics.service';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake');
const vfsModule = require('pdfmake/build/vfs_fonts.js');
const vfs: Record<string, string> = vfsModule.pdfMake?.vfs ?? vfsModule;
const font = (n: string) => Buffer.from(vfs[n]!, 'base64');
const printer = new PdfPrinter({
  Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') },
});

export const LEVEL_VI: Record<CompetencyLevel, string> = { EXCELLENT: 'Xuất sắc', GOOD: 'Tốt', NEEDS_IMPROVEMENT: 'Cần cải thiện', WEAK: 'Yếu' };
const DIFF_VI: Record<string, string> = { 1: 'Cơ bản', 2: 'Trung bình', 3: 'Nâng cao', 4: 'Chuyên gia' };
const LEVEL_COLOR: Record<CompetencyLevel, string> = { EXCELLENT: '#16a34a', GOOD: '#16a34a', NEEDS_IMPROVEMENT: '#ea580c', WEAK: '#dc2626' };
const pct = (n: number) => `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
const dt = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—');
const dur = (s: number) => `${Math.floor(s / 60)} phút ${s % 60} giây`;

export function renderPdf(doc: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = printer.createPdfKitDocument({
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 50],
      defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.25 },
      styles: {
        h1: { fontSize: 17, bold: true, color: '#0b1324' },
        h2: { fontSize: 12, bold: true, color: '#1e3a8a', margin: [0, 14, 0, 6] },
        muted: { color: '#64748b', fontSize: 9 },
        th: { bold: true, color: '#ffffff', fillColor: '#1e3a8a', fontSize: 9 },
      },
      footer: (page: number, pages: number) => ({ text: `Nền tảng Sát hạch Kỹ thuật Điện mặt trời · Trang ${page}/${pages}`, alignment: 'center', style: 'muted', margin: [0, 15, 0, 0] }),
      ...doc,
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.end();
  });
}

const tableLayout = { hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0', paddingTop: () => 4, paddingBottom: () => 4 };

function bucketTable(buckets: Bucket[], labelHeader: string, labelOf: (b: Bucket) => string): Content {
  const body: TableCell[][] = [
    [{ text: labelHeader, style: 'th' }, { text: 'Đúng/Tổng', style: 'th', alignment: 'center' }, { text: 'Điểm', style: 'th', alignment: 'right' }, { text: 'Đánh giá', style: 'th' }],
    ...buckets.map((b) => [
      labelOf(b),
      { text: `${b.correct}/${b.total}`, alignment: 'center' as const },
      { text: pct(b.percent), alignment: 'right' as const, bold: true },
      { text: LEVEL_VI[b.level], color: LEVEL_COLOR[b.level], bold: true },
    ]),
  ];
  return { table: { headerRows: 1, widths: ['*', 60, 50, 80], body }, layout: tableLayout };
}

export interface ResultPdfData {
  exam: { name: string; code: string; passingScore: number; durationMinutes: number };
  candidate: { fullName: string; username: string; department: string | null; position: string | null };
  attemptNo: number;
  submittedAt: Date | string | null;
  status: string;
  summary: { scorePercent: number; pointsEarned: number; pointsTotal: number; correctCount: number; incorrectCount: number; unansweredCount: number; durationSeconds: number; passed: boolean };
  byCategory?: Bucket[];
  byDifficulty?: Bucket[];
  analysis?: { weaknesses: Array<{ code?: string; label: string; percent: number; level: CompetencyLevel }>; strengths: Array<{ code?: string; label: string; percent: number }> };
}

export function resultPdf(d: ResultPdfData) {
  const s = d.summary;
  const content: Content[] = [
    { text: 'BÁO CÁO KẾT QUẢ SÁT HẠCH KỸ THUẬT', style: 'h1' },
    { text: `${d.exam.name} (${d.exam.code})`, margin: [0, 4, 0, 12] },
    {
      columns: [
        { width: '*', stack: [
          { text: [{ text: 'Thí sinh: ', style: 'muted' }, { text: d.candidate.fullName, bold: true }] },
          { text: [{ text: 'Đơn vị: ', style: 'muted' }, `${d.candidate.department ?? '—'}${d.candidate.position ? ' · ' + d.candidate.position : ''}`] },
          { text: [{ text: 'Lần thi: ', style: 'muted' }, String(d.attemptNo)] },
          { text: [{ text: 'Thời điểm nộp: ', style: 'muted' }, dt(d.submittedAt), d.status === 'AUTO_SUBMITTED' ? ' (tự động nộp khi hết giờ)' : ''] },
        ] },
        { width: 170, table: { widths: ['*'], body: [[{
          stack: [
            { text: pct(s.scorePercent), fontSize: 26, bold: true, alignment: 'center', color: s.passed ? '#16a34a' : '#dc2626' },
            { text: s.passed ? 'ĐẠT' : 'CHƯA ĐẠT', alignment: 'center', bold: true, color: s.passed ? '#16a34a' : '#dc2626' },
            { text: `Điểm đạt: ${pct(d.exam.passingScore)}`, alignment: 'center', style: 'muted' },
          ], margin: [0, 6, 0, 6],
        }]] }, layout: { hLineColor: () => (s.passed ? '#16a34a' : '#dc2626'), vLineColor: () => (s.passed ? '#16a34a' : '#dc2626') } },
      ],
    },
    { text: 'Tổng hợp', style: 'h2' },
    {
      table: {
        widths: ['*', '*', '*', '*', '*'],
        body: [
          [{ text: 'Số câu đúng', style: 'th' }, { text: 'Số câu sai', style: 'th' }, { text: 'Chưa trả lời', style: 'th' }, { text: 'Điểm', style: 'th' }, { text: 'Thời gian', style: 'th' }],
          [String(s.correctCount), String(s.incorrectCount), String(s.unansweredCount), `${s.pointsEarned}/${s.pointsTotal}`, `${dur(s.durationSeconds)} / ${d.exam.durationMinutes} phút`],
        ],
      },
      layout: tableLayout,
    },
  ];
  if (d.byCategory?.length) content.push({ text: 'Điểm theo lĩnh vực kỹ thuật', style: 'h2' }, bucketTable(d.byCategory, 'Lĩnh vực kỹ thuật', (b) => `${b.code ?? ''}. ${b.label}`));
  if (d.byDifficulty?.length) content.push({ text: 'Điểm theo độ khó', style: 'h2' }, bucketTable(d.byDifficulty, 'Độ khó', (b) => DIFF_VI[b.key] ?? b.key));
  if (d.analysis) {
    content.push({ text: 'Đánh giá năng lực và khuyến nghị', style: 'h2' });
    if (!d.analysis.weaknesses.length) content.push({ text: 'Không có lĩnh vực nào dưới mức yêu cầu.', color: '#16a34a' });
    else
      content.push({
        ul: d.analysis.weaknesses.map((w) => ({
          text: [
            { text: `${w.code}. ${w.label} – ${pct(w.percent)} (${LEVEL_VI[w.level]}): `, bold: true, color: LEVEL_COLOR[w.level] },
            w.level === 'WEAK' ? 'Cần đào tạo lại nền tảng và thực hành bài tập tính toán của lĩnh vực này.' : 'Cần ôn luyện thêm các tình huống thiết kế và tính toán của lĩnh vực này.',
          ],
          margin: [0, 2, 0, 2],
        })),
      });
    if (d.analysis.strengths.length) content.push({ text: [{ text: 'Điểm mạnh: ', bold: true }, d.analysis.strengths.map((x) => `${x.code}. ${x.label} (${pct(x.percent)})`).join('; ')], margin: [0, 8, 0, 0] });
  }
  content.push({ text: `Báo cáo được tạo lúc ${dt(new Date())}.`, style: 'muted', margin: [0, 20, 0, 0] });
  return renderPdf({ content, info: { title: `Kết quả – ${d.candidate.fullName}`, creator: 'Nền tảng Sát hạch PV' } });
}

export function analyticsPdf(title: string, a: Awaited<ReturnType<typeof analytics>>) {
  const content: Content[] = [
    { text: 'BÁO CÁO PHÂN TÍCH NĂNG LỰC', style: 'h1' },
    { text: title, margin: [0, 4, 0, 10] },
    {
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [{ text: 'Lượt thi', style: 'th' }, { text: 'Thí sinh', style: 'th' }, { text: 'Điểm trung bình', style: 'th' }, { text: 'Tỷ lệ đạt', style: 'th' }],
          [String(a.count), String(a.candidates), pct(a.avgScore), pct(a.passRate)],
        ],
      },
      layout: tableLayout,
    },
  ];
  if (a.categories.length) content.push({ text: 'Năng lực trung bình theo lĩnh vực', style: 'h2' }, bucketTable(a.categories, 'Lĩnh vực kỹ thuật', (b) => `${b.code ?? ''}. ${b.label}`));
  if (a.difficulty.length) content.push({ text: 'Hiệu quả theo độ khó', style: 'h2' }, bucketTable(a.difficulty, 'Độ khó', (b) => DIFF_VI[b.key] ?? b.key));
  if (a.ranking.length)
    content.push({ text: 'Xếp hạng nhân sự', style: 'h2' }, {
      table: {
        headerRows: 1,
        widths: [30, '*', '*', 55, 50],
        body: [
          [{ text: 'Hạng', style: 'th' }, { text: 'Thí sinh', style: 'th' }, { text: 'Đơn vị', style: 'th' }, { text: 'Điểm', style: 'th', alignment: 'right' }, { text: 'Kết quả', style: 'th' }],
          ...a.ranking.slice(0, 50).map((r) => [String(r.rank), r.user.fullName, r.user.department ?? '—', { text: pct(r.bestScore), alignment: 'right' as const, bold: true }, { text: r.passed ? 'Đạt' : 'Chưa đạt', color: r.passed ? '#16a34a' : '#dc2626' }]),
        ],
      },
      layout: tableLayout,
    });
  if (a.hardestQuestions.length)
    content.push({ text: 'Câu hỏi có tỷ lệ đúng thấp nhất', style: 'h2' }, {
      table: {
        headerRows: 1,
        widths: [70, '*', 50, 55],
        body: [[{ text: 'Mã', style: 'th' }, { text: 'Câu hỏi', style: 'th' }, { text: 'Lượt', style: 'th' }, { text: 'Tỷ lệ đúng', style: 'th' }], ...a.hardestQuestions.map((q) => [q.code, q.title, String(q.attempts), pct(q.correctRate)])],
      },
      layout: tableLayout,
    });
  content.push({ text: `Báo cáo được tạo lúc ${dt(new Date())}.`, style: 'muted', margin: [0, 20, 0, 0] });
  return renderPdf({ content, pageOrientation: 'portrait', info: { title, creator: 'Nền tảng Sát hạch PV' } });
}

function header(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function resultsExcel(rows: Array<ReturnType<typeof serializeResultRow>>, a: Awaited<ReturnType<typeof analytics>>) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nền tảng Sát hạch PV';
  const ws = wb.addWorksheet('Kết quả thi');
  ws.columns = [
    { header: 'Mã đề', key: 'code', width: 14 },
    { header: 'Đề thi', key: 'exam', width: 36 },
    { header: 'Thí sinh', key: 'name', width: 24 },
    { header: 'Tên đăng nhập', key: 'username', width: 16 },
    { header: 'Phòng ban', key: 'dept', width: 20 },
    { header: 'Lần thi', key: 'attemptNo', width: 8 },
    { header: 'Thời điểm nộp', key: 'submittedAt', width: 20 },
    { header: 'Điểm (%)', key: 'score', width: 10 },
    { header: 'Số câu đúng', key: 'correct', width: 11 },
    { header: 'Số câu sai', key: 'incorrect', width: 10 },
    { header: 'Chưa trả lời', key: 'unanswered', width: 11 },
    { header: 'Thời gian (phút)', key: 'minutes', width: 12 },
    { header: 'Kết quả', key: 'result', width: 11 },
    { header: 'Hình thức nộp', key: 'status', width: 16 },
  ];
  header(ws);
  for (const r of rows) {
    const row = ws.addRow({
      code: r.exam.code, exam: r.exam.name, name: r.user.fullName, username: r.user.username, dept: r.user.department ?? '',
      attemptNo: r.attemptNo, submittedAt: r.submittedAt ? new Date(r.submittedAt) : null, score: r.scorePercent, correct: r.correctCount,
      incorrect: r.incorrectCount, unanswered: r.unansweredCount, minutes: Math.round((r.durationSeconds / 60) * 10) / 10,
      result: r.passed ? 'Đạt' : 'Chưa đạt', status: r.status === 'AUTO_SUBMITTED' ? 'Tự động (hết giờ)' : 'Thí sinh nộp',
    });
    row.getCell('submittedAt').numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell('score').numFmt = '0.0';
    row.getCell('result').font = { bold: true, color: { argb: r.passed ? 'FF16A34A' : 'FFDC2626' } };
  }
  ws.autoFilter = { from: 'A1', to: 'N1' };

  // Competency matrix per candidate attempt
  const codes = [...new Set(rows.flatMap((r) => r.byCategory.map((b) => `${b.code}|${b.label}`)))].sort();
  const cs = wb.addWorksheet('Năng lực theo lĩnh vực');
  cs.columns = [{ header: 'Thí sinh', key: 'name', width: 24 }, { header: 'Đề thi', key: 'exam', width: 30 }, ...codes.map((c) => ({ header: `${c.split('|')[0]}. ${c.split('|')[1]} (%)`, key: c, width: 18 }))];
  header(cs);
  for (const r of rows) {
    const rec: Record<string, unknown> = { name: r.user.fullName, exam: r.exam.name };
    for (const b of r.byCategory) rec[`${b.code}|${b.label}`] = b.percent;
    cs.addRow(rec);
  }

  const sum = wb.addWorksheet('Tổng hợp');
  sum.columns = [{ header: 'Chỉ tiêu', key: 'k', width: 34 }, { header: 'Giá trị', key: 'v', width: 20 }];
  header(sum);
  sum.addRows([
    { k: 'Số lượt thi', v: a.count },
    { k: 'Số thí sinh', v: a.candidates },
    { k: 'Điểm trung bình (%)', v: a.avgScore },
    { k: 'Tỷ lệ đạt (%)', v: a.passRate },
  ]);
  sum.addRow({});
  sum.addRow({ k: 'Lĩnh vực kỹ thuật', v: 'Điểm TB (%) / Đánh giá' }).font = { bold: true };
  for (const c of a.categories) sum.addRow({ k: `${c.code}. ${c.label}`, v: `${c.percent} – ${LEVEL_VI[c.level]}` });
  return wb.xlsx.writeBuffer();
}
