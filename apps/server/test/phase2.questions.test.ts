import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import { Client, loginAs, upload } from './helpers';

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('Phase 2 – question bank', () => {
  let admin: Client, author: Client, cand: Client, manager: Client;
  let cats: Array<{ id: string; code: string; children: Array<{ id: string; code: string }> }>;
  const catId = (code: string) => cats.find((c) => c.code === code)!.id;

  const baseQ = () => ({
    title: 'Tính sụt áp cáp DC cho chuỗi mái xưởng B',
    content: 'Chuỗi có Imp = 10 A, Vmp = 600 V, chiều dài tuyến một chiều 50 m, cáp đồng 4 mm², ρ = 0,0175. Tính sụt áp phần trăm của mạch DC hai dây.',
    type: 'SINGLE_CHOICE',
    categoryId: catId('G'),
    difficulty: 3,
    calcComplexity: 2,
    isCalculation: true,
    isScenario: false,
    assumptions: 'Hai dây cùng chiều dài.',
    explanation: 'ΔU = 2·50·10·0,0175/4 = 4,375 V → 4,375/600 = 0,729 %. Giải thích đủ dài.',
    calcMethod: 'ΔU = 2LIρ/S',
    calcSpec: { templateId: 'vdrop_dc_percent', variables: { l: 50, i: 10, rho: 0.0175, s: 4, u: 600 } },
    numericTolerance: 0.01,
    toleranceType: 'RELATIVE',
    tags: ['Sụt áp', 'cáp dc'],
    options: [
      { label: '0,73 %', isCorrect: true, numericValue: 0.729 },
      { label: '0,36 %', isCorrect: false, numericValue: 0.365 },
      { label: '1,46 %', isCorrect: false, numericValue: 1.458 },
    ],
    references: [],
  });

  beforeAll(async () => {
    admin = await loginAs('admin');
    author = await loginAs('bientap');
    cand = await loginAs('ts.nguyenvan');
    manager = await loginAs('quanly');
    cats = (await admin.get('/api/categories')).json();
  });

  it('lists seeded questions with filters and pagination', async () => {
    const all = (await admin.get('/api/questions?pageSize=100')).json();
    expect(all.total).toBeGreaterThanOrEqual(50);
    const c = (await admin.get(`/api/questions?categoryId=${catId('C')}&difficulty=4`)).json();
    expect(c.items.every((q: { category: { code: string }; difficulty: number }) => q.category.code === 'C' && q.difficulty === 4)).toBe(true);
    const search = (await admin.get('/api/questions?q=' + encodeURIComponent('sụt áp'))).json();
    expect(search.total).toBeGreaterThan(0);
    const calc = (await admin.get('/api/questions?isCalculation=true&pageSize=200')).json();
    expect(calc.items.every((q: { isCalculation: boolean }) => q.isCalculation)).toBe(true);
  });

  it('candidates cannot access the question bank API (no answer key leakage)', async () => {
    expect((await cand.get('/api/questions')).statusCode).toBe(403);
    const anyId = (await admin.get('/api/questions?pageSize=1')).json().items[0].id;
    expect((await cand.get(`/api/questions/${anyId}`)).statusCode).toBe(403);
  });

  it('author creates a draft with code, revision 1 and normalised tags', async () => {
    const res = await author.post('/api/questions', baseQ());
    expect(res.statusCode).toBe(201);
    const q = res.json();
    expect(q.code).toMatch(/^PV-G-\d{4}$/);
    expect(q.status).toBe('DRAFT');
    expect(q.tags).toEqual(['sụt áp', 'cáp dc']);
    const detail = (await author.get(`/api/questions/${q.id}`)).json();
    expect(detail.revisions).toHaveLength(1);
    expect(detail.quality.verification.ok).toBe(true);
  });

  it('rejects invalid input with Vietnamese field messages', async () => {
    const res = await author.post('/api/questions', { ...baseQ(), title: '', difficulty: 7 });
    expect(res.statusCode).toBe(422);
    expect(res.json().details.some((d: { path: string }) => d.path === 'title')).toBe(true);
  });

  it('author cannot create in an unassigned category', async () => {
    const u = await admin.post('/api/users', { username: 'author2', fullName: 'Tác giả 2', roleCode: 'AUTHOR', password: 'AuthorPass1', categoryIds: [catId('A')] });
    expect(u.statusCode).toBe(201);
    const a2 = await loginAs('author2', 'AuthorPass1');
    expect((await a2.post('/api/questions', baseQ())).statusCode).toBe(403);
    // and cannot see other authors' questions
    expect((await a2.get('/api/questions')).json().total).toBe(0);
  });

  it('quality gate blocks submission when the answer key contradicts the calculation', async () => {
    const bad = { ...baseQ(), options: [
      { label: '0,73 %', isCorrect: false, numericValue: 0.729 },
      { label: '0,36 %', isCorrect: true, numericValue: 0.365 },
      { label: '1,46 %', isCorrect: false, numericValue: 1.458 },
    ] };
    const r0 = await author.post('/api/questions', bad);
    const q = r0.json();
    const res = await author.post(`/api/questions/${q.id}/status`, { status: 'PENDING_REVIEW' });
    expect(res.statusCode).toBe(422);
    expect(res.json().details.map((d: { code: string }) => d.code)).toContain('CALC_MISMATCH');
  });

  it('full workflow: submit → reject (needs reason) → resubmit → approve → publish → edit resets → archive', async () => {
    const q = (await author.post('/api/questions', { ...baseQ(), title: 'Workflow test question' })).json();
    expect((await author.post(`/api/questions/${q.id}/status`, { status: 'PENDING_REVIEW' })).statusCode).toBe(200);
    // author cannot edit while pending
    expect((await author.put(`/api/questions/${q.id}`, baseQ())).statusCode).toBe(403);
    // author cannot approve
    expect((await author.post(`/api/questions/${q.id}/status`, { status: 'APPROVED' })).statusCode).toBe(403);
    // reject requires a comment
    expect((await admin.post(`/api/questions/${q.id}/status`, { status: 'DRAFT' })).statusCode).toBe(400);
    expect((await admin.post(`/api/questions/${q.id}/status`, { status: 'DRAFT', comment: 'Bổ sung giả thiết nhiệt độ' })).json().reviewComment).toBe('Bổ sung giả thiết nhiệt độ');
    await author.put(`/api/questions/${q.id}`, { ...baseQ(), title: 'Workflow test question v2', changeNote: 'Sửa theo góp ý' });
    await author.post(`/api/questions/${q.id}/status`, { status: 'PENDING_REVIEW' });
    const appr = (await admin.post(`/api/questions/${q.id}/status`, { status: 'APPROVED', comment: 'OK' })).json();
    expect(appr.status).toBe('APPROVED');
    expect(appr.approvedAt).toBeTruthy();
    expect((await admin.post(`/api/questions/${q.id}/status`, { status: 'PUBLISHED' })).json().status).toBe('PUBLISHED');
    // invalid transition
    expect((await admin.post(`/api/questions/${q.id}/status`, { status: 'PENDING_REVIEW' })).statusCode).toBe(400);
    // admin edit of published question resets to DRAFT and bumps version
    const edited = (await admin.put(`/api/questions/${q.id}`, { ...baseQ(), title: 'Workflow test question v3' })).json();
    expect(edited.status).toBe('DRAFT');
    expect(edited.version).toBe(3);
    const detail = (await admin.get(`/api/questions/${q.id}`)).json();
    expect(detail.revisions.map((r: { version: number }) => r.version)).toEqual([3, 2, 1]);
    expect(detail.reviewLogs.length).toBeGreaterThanOrEqual(5);
    // restore v1
    const restored = (await admin.post(`/api/questions/${q.id}/revisions/1/restore`)).json();
    expect(restored.title).toBe('Workflow test question');
    expect(restored.version).toBe(4);
    expect((await admin.post(`/api/questions/${q.id}/status`, { status: 'ARCHIVED' })).json().status).toBe('ARCHIVED');
  });

  it('reviewer queue lists pending questions with quality report', async () => {
    const q = (await author.post('/api/questions', { ...baseQ(), title: 'Pending queue item' })).json();
    await author.post(`/api/questions/${q.id}/status`, { status: 'PENDING_REVIEW' });
    const queue = (await admin.get('/api/questions-review/pending')).json();
    const item = queue.find((x: { id: string }) => x.id === q.id);
    expect(item.quality.verification.ok).toBe(true);
    expect((await author.get('/api/questions-review/pending')).statusCode).toBe(403);
  });

  it('detects near-duplicate questions (diacritic-insensitive)', async () => {
    const seeded = (await admin.get('/api/questions?q=' + encodeURIComponent('Số tấm tối đa trên một chuỗi theo điện áp'))).json().items[0];
    const full = (await admin.get(`/api/questions/${seeded.id}`)).json().question;
    const check = await admin.post('/api/questions/check', { input: { ...baseQ(), content: full.content.replace('5 °C', '6 °C') } });
    expect(check.statusCode).toBe(200);
    const sim = check.json().similar;
    expect(sim[0].code).toBe(full.code);
    expect(sim[0].isDuplicate).toBe(true);
  });

  it('duplicate and delete (draft, unused)', async () => {
    const q = (await author.post('/api/questions', { ...baseQ(), title: 'Dup source' })).json();
    const dup = (await author.post(`/api/questions/${q.id}/duplicate`)).json();
    expect(dup.title).toBe('Dup source (bản sao)');
    expect(dup.id).not.toBe(q.id);
    expect((await author.del(`/api/questions/${dup.id}`)).statusCode).toBe(200);
    expect((await author.get(`/api/questions/${dup.id}`)).statusCode).toBe(404);
  });

  it('calc evaluate endpoint is safe', async () => {
    expect((await author.post('/api/questions/calc-evaluate', { expression: '2*sqrt(16)', variables: {} })).json().value).toBe(8);
    expect((await author.post('/api/questions/calc-evaluate', { expression: 'process.exit(1)', variables: {} })).statusCode).toBe(400);
  });

  it('Excel: template, export and import round-trip (dry run then commit)', async () => {
    const tpl = await admin.get('/api/questions/excel/template');
    expect(tpl.statusCode).toBe(200);
    expect(tpl.headers['content-disposition']).toContain('mau-nhap-cau-hoi.xlsx');
    const exp = await admin.get(`/api/questions/excel/export?categoryId=${catId('H')}`);
    expect(exp.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exp.rawPayload as never);
    const ws = wb.getWorksheet('Câu hỏi')!;
    expect(ws.getRow(1).getCell(2).value).toBe('Tiêu đề (*)');
    expect(ws.rowCount - 1).toBeGreaterThanOrEqual(4);
    expect(String(ws.getRow(2).getCell(3).value)).toMatch(/[ăâđêôơư]/); // Vietnamese preserved

    // Build an import file from the template's sample row + one invalid row
    const t = new ExcelJS.Workbook();
    await t.xlsx.load(tpl.rawPayload as never);
    const s = t.getWorksheet('Câu hỏi')!;
    s.getRow(2).getCell(2).value = 'Câu hỏi nhập từ Excel – kiểm tra số tấm';
    s.getRow(2).getCell(3).value = 'Nội dung câu nhập Excel: tấm pin Voc = 48 V, β = −0,28 %/°C, Tmin 0 °C, inverter 1000 V. Hỏi số tấm tối đa của chuỗi là bao nhiêu?';
    const bad = s.getRow(3);
    bad.getCell(2).value = 'Dòng lỗi';
    bad.getCell(3).value = 'Nội dung lỗi dài đủ bốn mươi ký tự để không cảnh báo ngắn';
    bad.getCell(4).value = 'Loại lạ';
    bad.getCell(5).value = 'Z';
    bad.getCell(7).value = 3;
    bad.commit();
    const buf = Buffer.from(await t.xlsx.writeBuffer());
    const dry = await upload(admin, '/api/questions/excel/import?dryRun=true', { filename: 'nhap.xlsx', content: buf, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(dry.statusCode).toBe(200);
    const d = dry.json();
    expect(d.ok).toBe(1);
    expect(d.errors).toBe(1);
    expect(d.rows[1].errors.join(' ')).toMatch(/Loại câu hỏi không hợp lệ/);
    const before = (await admin.get('/api/questions?pageSize=1')).json().total;
    const real = await upload(admin, '/api/questions/excel/import?dryRun=false', { filename: 'nhap.xlsx', content: buf, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(real.json().ok).toBe(1);
    expect((await admin.get('/api/questions?pageSize=1')).json().total).toBe(before + 1);
    const created = (await admin.get(`/api/questions/${real.json().rows[0].createdId}`)).json().question;
    expect(created.status).toBe('DRAFT');
    expect(created.options.find((o: { isCorrect: boolean }) => o.isCorrect).label).toBe('21 tấm');
    // non-xlsx rejected
    const txt = await upload(admin, '/api/questions/excel/import', { filename: 'x.xlsx', content: Buffer.from('hello'), type: 'text/plain' });
    expect(txt.statusCode).toBe(400);
    // manager cannot import
    expect((await upload(manager, '/api/questions/excel/import', { filename: 'nhap.xlsx', content: buf, type: 'x' })).statusCode).toBe(403);
  });

  it('media: accepts real PNG, rejects spoofed/SVG files, enforces access', async () => {
    const ok = await upload(author, '/api/media', { filename: 'so-do.png', content: PNG_1PX, type: 'image/png' });
    expect(ok.statusCode).toBe(201);
    const { id, url } = ok.json();
    const svg = await upload(author, '/api/media', { filename: 'x.svg', content: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), type: 'image/png' });
    expect(svg.statusCode).toBe(400);
    const get = await author.get(url);
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    // candidate cannot fetch unrelated media
    expect((await cand.get(url)).statusCode).toBe(403);
    // media is linked when referenced in content
    const q = (await author.post('/api/questions', { ...baseQ(), title: 'Có sơ đồ', content: baseQ().content + `\n\n![Sơ đồ](/api/media/${id})` })).json();
    expect(q.media.map((m: { id: string }) => m.id)).toContain(id);
  });
});
