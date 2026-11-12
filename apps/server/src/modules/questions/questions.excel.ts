/**
 * Excel import/export for the question bank (Vietnamese template).
 * One row = one question. Options in columns "Phương án A".."Phương án F".
 */
import ExcelJS from 'exceljs';
import type { FastifyRequest } from 'fastify';
import { questionInputSchema, checkQuestionQuality, hasBlockingIssues, type QuestionInput, type QuestionType } from '@solar/shared';
import { prisma } from '../../db';
import { createQuestion, findSimilar, serializeQuestion, questionInclude } from './questions.service';
import { badRequest } from '../../lib/errors';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Một đáp án',
  MULTIPLE_CHOICE: 'Nhiều đáp án',
  TRUE_FALSE: 'Đúng/Sai',
  NUMERIC: 'Nhập số',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Bản nháp', PENDING_REVIEW: 'Chờ duyệt', APPROVED: 'Đã duyệt', PUBLISHED: 'Đã phát hành', ARCHIVED: 'Đã lưu trữ',
};

export const COLUMNS = [
  { key: 'code', header: 'Mã câu hỏi', width: 16 },
  { key: 'title', header: 'Tiêu đề (*)', width: 36 },
  { key: 'content', header: 'Nội dung câu hỏi (*)', width: 70 },
  { key: 'type', header: 'Loại câu hỏi (*)', width: 16 },
  { key: 'category', header: 'Mã lĩnh vực (*)', width: 12 },
  { key: 'sub', header: 'Mã chủ đề', width: 12 },
  { key: 'difficulty', header: 'Độ khó 1-4 (*)', width: 12 },
  { key: 'calcComplexity', header: 'Độ phức tạp tính toán 0-3', width: 14 },
  { key: 'isCalculation', header: 'Câu tính toán (Có/Không)', width: 14 },
  { key: 'isScenario', header: 'Tình huống thực tế (Có/Không)', width: 14 },
  { key: 'assumptions', header: 'Giả thiết kỹ thuật', width: 40 },
  ...LETTERS.map((l) => ({ key: `opt${l}`, header: `Phương án ${l}`, width: 28 })),
  { key: 'correct', header: 'Đáp án đúng (vd: A hoặc A;C hoặc Đúng)', width: 18 },
  { key: 'numericAnswer', header: 'Đáp án số', width: 12 },
  { key: 'unit', header: 'Đơn vị', width: 10 },
  { key: 'tolerance', header: 'Sai số chấp nhận', width: 12 },
  { key: 'toleranceType', header: 'Kiểu sai số (Tuyệt đối/Tương đối)', width: 16 },
  { key: 'explanation', header: 'Giải thích kỹ thuật', width: 60 },
  { key: 'calcMethod', header: 'Phương pháp tính', width: 50 },
  { key: 'conceptKey', header: 'Khóa khái niệm', width: 20 },
  { key: 'tags', header: 'Thẻ (phân cách bằng ;)', width: 24 },
  { key: 'references', header: 'Tham chiếu (Tiêu chuẩn|Phiên bản|Phạm vi|Điều khoản; ...)', width: 40 },
  { key: 'status', header: 'Trạng thái (chỉ khi xuất)', width: 14 },
] as const;

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 36;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function categoryMaps() {
  const cats = await prisma.questionCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  return { cats, byCode: new Map(cats.map((c) => [c.code.toUpperCase(), c])), byId: new Map(cats.map((c) => [c.id, c])) };
}

function addGuideSheets(wb: ExcelJS.Workbook, cats: Awaited<ReturnType<typeof categoryMaps>>['cats']) {
  const guide = wb.addWorksheet('Hướng dẫn');
  guide.columns = [{ width: 32 }, { width: 100 }];
  const rows: Array<[string, string]> = [
    ['HƯỚNG DẪN NHẬP CÂU HỎI', ''],
    ['Loại câu hỏi', 'Một đáp án | Nhiều đáp án | Đúng/Sai | Nhập số'],
    ['Mã lĩnh vực / chủ đề', 'Xem trang "Danh mục". Ví dụ lĩnh vực C, chủ đề C.7'],
    ['Độ khó', '1 = Cơ bản, 2 = Trung bình, 3 = Nâng cao, 4 = Chuyên gia'],
    ['Đáp án đúng', 'Ghi chữ cái phương án, nhiều đáp án phân cách bằng dấu ; (vd A;C). Câu Đúng/Sai ghi "Đúng" hoặc "Sai".'],
    ['Câu nhập số', 'Bỏ trống các phương án; điền Đáp án số, Đơn vị, Sai số và Kiểu sai số (Tương đối: 0,01 = 1%).'],
    ['Công thức', 'Có thể dùng KaTeX trong nội dung: $V_{oc}$, $$P = U \\cdot I$$'],
    ['Tham chiếu', 'Định dạng: Tiêu chuẩn|Phiên bản|Phạm vi áp dụng|Điều khoản; ... Chỉ ghi điều khoản khi đã đối chiếu văn bản gốc.'],
    ['Trạng thái', 'Mọi câu hỏi nhập vào đều ở trạng thái Bản nháp và phải qua quy trình duyệt.'],
    ['Trùng lặp', 'Hệ thống bỏ qua câu có Mã câu hỏi đã tồn tại và cảnh báo câu có nội dung gần giống.'],
  ];
  rows.forEach((r) => guide.addRow(r));
  guide.getRow(1).font = { bold: true, size: 14 };
  guide.getColumn(1).font = { bold: true };
  const cs = wb.addWorksheet('Danh mục');
  cs.columns = [{ header: 'Mã', key: 'code', width: 10 }, { header: 'Tên danh mục', key: 'name', width: 70 }];
  styleHeader(cs);
  for (const c of cats) cs.addRow({ code: c.code, name: (c.parentId ? '    ' : '') + c.name });
}

export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nền tảng Sát hạch PV';
  const { cats } = await categoryMaps();
  const ws = wb.addWorksheet('Câu hỏi');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeader(ws);
  ws.addRow({
    title: 'Ví dụ – Kiểm tra số tấm tối đa của chuỗi',
    content: 'Tấm pin có $V_{oc}$ = 49,5 V, $\\beta_{Voc}$ = −0,27 %/°C. Nhiệt độ thấp nhất 5 °C. Inverter có điện áp DC tối đa 1100 V. Số tấm tối đa trên một chuỗi là bao nhiêu?',
    type: 'Một đáp án', category: 'C', sub: 'C.1', difficulty: 3, calcComplexity: 2, isCalculation: 'Có', isScenario: 'Không',
    assumptions: 'Bỏ qua sai số chế tạo; nhiệt độ cell bằng nhiệt độ môi trường lúc bình minh.',
    optA: '20 tấm', optB: '21 tấm', optC: '22 tấm', optD: '19 tấm', correct: 'B',
    explanation: 'Voc(5 °C) = 49,5 × [1 − 0,0027 × (5 − 25)] = 52,17 V → N = ⌊1100 / 52,17⌋ = 21.',
    calcMethod: '1) Hiệu chỉnh Voc theo nhiệt độ thấp nhất. 2) Chia điện áp DC tối đa cho Voc hiệu chỉnh, làm tròn xuống.',
    conceptKey: 'string-max-voc', tags: 'string sizing;voc', references: 'IEC 62548|2016|Quốc tế|',
  });
  addGuideSheets(wb, cats);
  return wb.xlsx.writeBuffer();
}

export async function exportQuestions(where: import('@prisma/client').Prisma.QuestionWhereInput) {
  const { cats, byId } = await categoryMaps();
  const qs = await prisma.question.findMany({ where, include: questionInclude, orderBy: { code: 'asc' } });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nền tảng Sát hạch PV';
  const ws = wb.addWorksheet('Câu hỏi');
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeader(ws);
  for (const raw of qs) {
    const q = serializeQuestion(raw);
    const row: Record<string, unknown> = {
      code: q.code, title: q.title, content: q.content, type: TYPE_LABEL[q.type], category: byId.get(q.categoryId)?.code,
      sub: q.subcategoryId ? byId.get(q.subcategoryId)?.code : '', difficulty: q.difficulty, calcComplexity: q.calcComplexity,
      isCalculation: q.isCalculation ? 'Có' : 'Không', isScenario: q.isScenario ? 'Có' : 'Không', assumptions: q.assumptions ?? '',
      numericAnswer: q.numericAnswer ?? '', unit: q.numericUnit ?? '', tolerance: q.numericTolerance ?? '',
      toleranceType: q.toleranceType ? (q.toleranceType === 'ABSOLUTE' ? 'Tuyệt đối' : 'Tương đối') : '',
      explanation: q.explanation ?? '', calcMethod: q.calcMethod ?? '', conceptKey: q.conceptKey ?? '', tags: q.tags.join(';'),
      references: q.references.map((r) => [r.standard, r.edition ?? '', r.jurisdiction ?? '', r.clause ?? ''].join('|')).join('; '),
      status: STATUS_LABEL[q.status],
    };
    if (q.type === 'TRUE_FALSE') {
      row.correct = q.options.find((o) => o.isCorrect)?.label ?? '';
    } else {
      q.options.slice(0, 6).forEach((o, i) => (row[`opt${LETTERS[i]}`] = o.label));
      row.correct = q.options.map((o, i) => (o.isCorrect ? LETTERS[i] : null)).filter(Boolean).join(';');
    }
    const r = ws.addRow(row);
    r.alignment = { vertical: 'top', wrapText: true };
  }
  addGuideSheets(wb, cats);
  return { buffer: await wb.xlsx.writeBuffer(), count: qs.length };
}

// ───────────── Import ─────────────

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return String(v.result ?? '');
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}
const yes = (s: string) => /^(có|co|x|yes|true|1)$/i.test(s.trim());
function num(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
function parseType(s: string): QuestionType | null {
  const t = s.trim().toLowerCase();
  const map: Record<string, QuestionType> = {
    'một đáp án': 'SINGLE_CHOICE', 'mot dap an': 'SINGLE_CHOICE', single_choice: 'SINGLE_CHOICE',
    'nhiều đáp án': 'MULTIPLE_CHOICE', 'nhieu dap an': 'MULTIPLE_CHOICE', multiple_choice: 'MULTIPLE_CHOICE',
    'đúng/sai': 'TRUE_FALSE', 'dung/sai': 'TRUE_FALSE', true_false: 'TRUE_FALSE',
    'nhập số': 'NUMERIC', 'nhap so': 'NUMERIC', numeric: 'NUMERIC',
  };
  return map[t] ?? null;
}

export interface ImportRowResult {
  row: number;
  code?: string;
  title?: string;
  status: 'ok' | 'error' | 'skipped';
  errors: string[];
  warnings: string[];
  createdId?: string;
}

export async function importQuestions(req: FastifyRequest, buf: Buffer, dryRun: boolean) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw badRequest('Không đọc được tệp Excel. Vui lòng dùng định dạng .xlsx theo file mẫu.');
  }
  const ws = wb.getWorksheet('Câu hỏi') ?? wb.worksheets[0];
  if (!ws) throw badRequest('Tệp Excel không có dữ liệu');
  // Map header text -> column key
  const headerIdx = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = cellText(cell.value);
    const c = COLUMNS.find((x) => x.header === h || x.header.replace(' (*)', '') === h.replace(' (*)', ''));
    if (c) headerIdx.set(c.key, col);
  });
  for (const req of ['title', 'content', 'type', 'category', 'difficulty'])
    if (!headerIdx.has(req)) throw badRequest(`Thiếu cột bắt buộc: ${COLUMNS.find((c) => c.key === req)!.header}`);
  if (ws.rowCount > 1001) throw badRequest('Mỗi lần nhập tối đa 1000 câu hỏi');

  const { byCode } = await categoryMaps();
  const results: ImportRowResult[] = [];
  const seenContent = new Set<string>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: string) => (headerIdx.has(k) ? cellText(row.getCell(headerIdx.get(k)!).value) : '');
    if (!get('title') && !get('content')) continue;
    const res: ImportRowResult = { row: r, code: get('code') || undefined, title: get('title'), status: 'ok', errors: [], warnings: [] };
    results.push(res);
    try {
      if (res.code && (await prisma.question.findUnique({ where: { code: res.code } }))) {
        res.status = 'skipped';
        res.warnings.push(`Mã câu hỏi ${res.code} đã tồn tại – bỏ qua`);
        continue;
      }
      const type = parseType(get('type'));
      if (!type) res.errors.push(`Loại câu hỏi không hợp lệ: "${get('type')}"`);
      const cat = byCode.get(get('category').toUpperCase());
      if (!cat || cat.parentId) res.errors.push(`Mã lĩnh vực không hợp lệ: "${get('category')}"`);
      const subCode = get('sub').toUpperCase();
      const sub = subCode ? byCode.get(subCode) : undefined;
      if (subCode && (!sub || sub.parentId !== cat?.id)) res.errors.push(`Mã chủ đề không hợp lệ hoặc không thuộc lĩnh vực: "${subCode}"`);
      const difficulty = num(get('difficulty'));
      const calcComplexity = num(get('calcComplexity')) ?? 0;

      let options: QuestionInput['options'] = [];
      const correctRaw = get('correct');
      if (type === 'TRUE_FALSE') {
        const v = correctRaw.toLowerCase();
        if (!['đúng', 'dung', 'sai', 'true', 'false'].includes(v)) res.errors.push('Câu Đúng/Sai: cột Đáp án đúng phải là "Đúng" hoặc "Sai"');
        const isTrue = ['đúng', 'dung', 'true'].includes(v);
        options = [
          { label: 'Đúng', isCorrect: isTrue },
          { label: 'Sai', isCorrect: !isTrue },
        ];
      } else if (type && type !== 'NUMERIC') {
        const correctSet = new Set(correctRaw.toUpperCase().split(/[;,\s]+/).filter(Boolean));
        for (const l of correctSet) if (!LETTERS.includes(l)) res.errors.push(`Đáp án đúng không hợp lệ: "${l}"`);
        LETTERS.forEach((l) => {
          const label = get(`opt${l}`);
          if (label) options.push({ label, isCorrect: correctSet.has(l) });
          else if (correctSet.has(l)) res.errors.push(`Phương án ${l} được đánh dấu đúng nhưng bỏ trống`);
        });
      }
      const numericAnswer = type === 'NUMERIC' ? num(get('numericAnswer')) : null;
      if (Number.isNaN(numericAnswer as number)) res.errors.push('Đáp án số không hợp lệ');
      const tolerance = num(get('tolerance'));
      const tolType = get('toleranceType').toLowerCase();
      const references = get('references')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [standard, edition, jurisdiction, clause] = s.split('|').map((x) => x?.trim() || null);
          return { standard: standard ?? '', edition, jurisdiction, clause, verified: false };
        });

      if (res.errors.length) {
        res.status = 'error';
        continue;
      }
      const candidate = {
        title: get('title'),
        content: get('content'),
        type,
        categoryId: cat!.id,
        subcategoryId: sub?.id ?? null,
        difficulty,
        calcComplexity,
        isCalculation: yes(get('isCalculation')),
        isScenario: yes(get('isScenario')),
        assumptions: get('assumptions') || null,
        explanation: get('explanation') || null,
        calcMethod: get('calcMethod') || null,
        conceptKey: get('conceptKey') || null,
        tags: get('tags').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
        options,
        numericAnswer,
        numericUnit: get('unit') || null,
        numericTolerance: Number.isNaN(tolerance as number) ? null : tolerance,
        toleranceType: type === 'NUMERIC' ? (tolType.startsWith('tuy') ? 'ABSOLUTE' : 'RELATIVE') : null,
        references,
        changeNote: 'Nhập từ Excel',
      };
      const parsed = questionInputSchema.safeParse(candidate);
      if (!parsed.success) {
        res.status = 'error';
        res.errors.push(...parsed.error.issues.map((i) => `${i.path.join('.') || 'dữ liệu'}: ${i.message}`));
        continue;
      }
      const issues = checkQuestionQuality(parsed.data);
      res.warnings.push(...issues.filter((i) => i.severity === 'warning').map((i) => i.message));
      if (hasBlockingIssues(issues)) {
        res.status = 'error';
        res.errors.push(...issues.filter((i) => i.severity === 'error').map((i) => i.message));
        continue;
      }
      const key = parsed.data.content.trim().toLowerCase();
      if (seenContent.has(key)) {
        res.status = 'skipped';
        res.warnings.push('Trùng nội dung với một dòng khác trong tệp – bỏ qua');
        continue;
      }
      seenContent.add(key);
      const similar = await findSimilar(parsed.data.content, { limit: 1 });
      if (similar[0]?.isDuplicate) res.warnings.push(`Nội dung gần giống câu ${similar[0].code} (độ tương đồng ${Math.round(similar[0].score * 100)}%)`);
      if (!dryRun) {
        const created = await createQuestion(req, parsed.data);
        res.createdId = created.id;
        res.code = created.code;
      }
    } catch (e) {
      res.status = 'error';
      res.errors.push((e as Error).message);
    }
  }
  return {
    dryRun,
    total: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    errors: results.filter((r) => r.status === 'error').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    rows: results,
  };
}
