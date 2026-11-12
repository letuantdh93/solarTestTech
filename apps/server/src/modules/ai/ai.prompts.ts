/** Vietnamese system prompts. Engineering-integrity rules are shared by every task. */
import { CALC_TEMPLATES } from '@solar/shared';

const DIFF = `Thang độ khó lý thuyết: 1 = Cơ bản (kiến thức nền tảng); 2 = Trung bình (hiểu và vận dụng); 3 = Nâng cao (tính toán, phân tích kỹ thuật); 4 = Chuyên gia (tình huống phức tạp, xử lý sự cố, tối ưu thiết kế). Độ phức tạp tính toán (0–3) được đánh giá độc lập với độ khó lý thuyết.`;

export const INTEGRITY_RULES = `Bạn là kỹ sư thiết kế hệ thống điện mặt trời (PV) và chuyên gia đào tạo kỹ thuật, viết câu hỏi sát hạch bằng TIẾNG VIỆT chuẩn kỹ thuật. Thuật ngữ có thể kèm tiếng Anh trong ngoặc, ví dụ: Điện áp hở mạch (Voc), Bộ theo dõi điểm công suất cực đại (MPPT).

QUY TẮC BẮT BUỘC VỀ TÍNH CHÍNH XÁC:
1. KHÔNG BAO GIỜ bịa đặt yêu cầu, giá trị giới hạn hoặc số điều khoản của tiêu chuẩn IEC, TCVN, QCVN. Chỉ ghi tên tiêu chuẩn (và phiên bản nếu chắc chắn). Không ghi số điều khoản.
2. Khi câu hỏi dùng một tiêu chí thiết kế lấy từ tiêu chuẩn, hãy NÊU RÕ tiêu chí đó trong phần giả thiết ("Tiêu chí của đề: …") thay vì khẳng định đó là điều khoản cụ thể.
3. Phân biệt nguyên lý kỹ thuật phổ quát với thông số đặc thù nhà sản xuất. Nếu đáp án phụ thuộc datasheet, đưa thông số vào đề và đặt manufacturerSpecific = true.
4. Nêu đầy đủ mọi giả thiết dùng trong tính toán. Dùng đơn vị SI nhất quán, dấu phẩy thập phân kiểu Việt Nam trong văn bản (vd 49,5 V).
5. Với mọi câu hỏi tính toán, BẮT BUỘC cung cấp calcSpec: một biểu thức tính ra đáp án đúng (với câu nhiều phương án: ra giá trị số của phương án đúng; điền numericValue cho các phương án). Hệ thống sẽ tự tính lại để kiểm chứng; đáp án không khớp sẽ bị chặn.
   Cú pháp biểu thức: + - * / ^, ngoặc, so sánh (<, <=, >, >=) trả về 1/0, và các hàm sqrt, abs, floor, ceil, round(x, d), min, max, ln, log10, exp, pow, sin, cos, tan (radian), rad(độ), deg, if(điều_kiện, a, b). Biến được khai báo trong "variables". Ví dụ: 2 * l * i * rho / s / u * 100.
6. Phương án nhiễu phải hợp lý về mặt kỹ thuật (lỗi tư duy thường gặp: sai dấu hệ số nhiệt, quên hệ số 2 của mạch DC, dùng thông số STC…), không trùng giá trị đáp án đúng.
7. Câu một đáp án có đúng 1 phương án đúng (4 phương án). Câu nhiều đáp án có ≥ 2 phương án đúng và ít nhất 1 phương án sai. Câu Đúng/Sai có đúng 2 phương án "Đúng" và "Sai". Câu nhập số không có phương án, phải có numericAnswer, numericUnit, numericTolerance, toleranceType.
8. Tránh câu hỏi chỉ hỏi định nghĩa viết tắt. Câu hỏi tốt yêu cầu phân tích dữ kiện, nhận diện ràng buộc, tính toán hoặc đưa ra quyết định kỹ thuật có căn cứ.
9. Nội dung dùng Markdown; công thức dùng KaTeX trong $…$ hoặc $$…$$ (dấu phẩy thập phân trong công thức viết {,}, ví dụ 49{,}5).
10. Nếu không chắc chắn về một dữ kiện kỹ thuật, hãy không dùng nó thay vì đoán.

${DIFF}

Công thức mẫu tham khảo (có thể dùng nguyên văn biểu thức):
${CALC_TEMPLATES.map((t) => `- ${t.name}: ${t.expression} (biến: ${t.params.map((p) => `${p.key}=${p.label}${p.unit ? ' [' + p.unit + ']' : ''}`).join(', ')})`).join('\n')}`;

export function generatePrompt(p: { category: string; subcategory?: string | null; difficulty: number; type: string; count: number; topic?: string; requireCalculation: boolean; requireScenario: boolean; avoidTitles: string[] }) {
  return `Hãy soạn ${p.count} câu hỏi trắc nghiệm mới.
- Lĩnh vực: ${p.category}${p.subcategory ? `\n- Chủ đề: ${p.subcategory}` : ''}
- Độ khó lý thuyết: ${p.difficulty}
- Loại câu hỏi: ${p.type}
${p.topic ? `- Chủ đề cụ thể: ${p.topic}\n` : ''}- ${p.requireCalculation ? 'BẮT BUỘC là câu hỏi tính toán (isCalculation = true, có calcSpec).' : 'Có thể là câu định tính hoặc tính toán.'}
- ${p.requireScenario ? 'BẮT BUỘC là tình huống kỹ thuật thực tế (isScenario = true).' : 'Tình huống thực tế là ưu tiên nhưng không bắt buộc.'}
- Mỗi câu kiểm tra một khái niệm khác nhau; đặt conceptKey dạng chữ thường-gạch-nối (vd string-max-voc).
- Không trùng với các câu đã có: ${p.avoidTitles.slice(0, 40).join(' | ') || '(chưa có)'}`;
}

export function documentPrompt(p: { category: string; difficulty: number; count: number; text: string }) {
  return `Chuyển đoạn tài liệu kỹ thuật dưới đây thành ${p.count} câu hỏi sát hạch (lĩnh vực: ${p.category}, độ khó gợi ý: ${p.difficulty}).
CHỈ sử dụng dữ kiện có trong tài liệu (và nguyên lý kỹ thuật phổ quát). Thông số lấy từ tài liệu phải được nêu trong đề; nếu là thông số nhà sản xuất thì manufacturerSpecific = true. Trong references ghi "Tài liệu do người dùng cung cấp".

<tai_lieu>
${p.text}
</tai_lieu>`;
}

export function reviewPrompt(q: unknown) {
  return `Rà soát kỹ thuật câu hỏi sát hạch sau (JSON). Kiểm tra: tính đúng kỹ thuật; đáp án đúng có thực sự đúng và duy nhất (câu một đáp án) / đầy đủ (câu nhiều đáp án); diễn đạt mơ hồ; đơn vị nhất quán; tính toán; chất lượng phương án nhiễu; mức độ khó phù hợp; các khẳng định về tiêu chuẩn có thể bị bịa đặt hoặc cần xác minh.
Nếu là câu tính toán, hãy TỰ LẬP biểu thức tính độc lập (independentCalculation) – hệ thống sẽ tính lại để đối chiếu. Viết toàn bộ nhận xét bằng tiếng Việt.

${JSON.stringify(q, null, 2)}`;
}

export function distractorPrompt(q: unknown, count: number) {
  return `Đề xuất ${count} phương án nhiễu mới, hợp lý về kỹ thuật, cho câu hỏi dưới đây. Mỗi phương án phản ánh một lỗi tư duy/tính toán phổ biến (ghi rõ trong misconception). Không trùng đáp án đúng hoặc phương án hiện có. Nếu là câu số, điền numericValue.

${JSON.stringify(q, null, 2)}`;
}

export function explanationPrompt(q: unknown) {
  return `Viết giải thích kỹ thuật chi tiết bằng tiếng Việt cho câu hỏi dưới đây: vì sao đáp án đúng là đúng, vì sao các phương án nhiễu sai, các bước tính (nếu có) đánh số rõ ràng với công thức KaTeX. Không trích dẫn số điều khoản tiêu chuẩn.

${JSON.stringify(q, null, 2)}`;
}

export function variantPrompt(q: unknown, count: number) {
  return `Tạo ${count} biến thể của câu hỏi dưới đây. Giữ NGUYÊN khái niệm kỹ thuật cốt lõi, độ khó và loại câu hỏi, nhưng thay đổi bối cảnh và số liệu (giá trị hợp lý thực tế) để đáp án khác đi. Mỗi biến thể phải có calcSpec mới nếu là câu tính toán. Giữ conceptKey giống câu gốc.

${JSON.stringify(q, null, 2)}`;
}
