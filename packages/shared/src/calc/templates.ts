import { evaluate } from './expression';

/**
 * Library of engineering formula templates used by question authors and by
 * answer-key verification. Each template is just an expression over named
 * parameters, so verification always runs through the same safe evaluator.
 * Formulas are universal engineering relations; no standard-specific limits
 * are encoded here (those must be stated as assumptions in the question).
 */
export interface CalcParam {
  key: string;
  label: string; // Vietnamese label
  unit: string;
}

export interface CalcTemplate {
  id: string;
  name: string; // Vietnamese
  latex: string;
  expression: string;
  params: CalcParam[];
  resultUnit: string;
}

export const CALC_TEMPLATES: CalcTemplate[] = [
  {
    id: 'voc_at_temp',
    name: 'Điện áp hở mạch hiệu chỉnh theo nhiệt độ (Voc)',
    latex: 'V_{oc}(T) = V_{oc,STC}\\,[1 + \\beta_{Voc}(T - 25)]',
    expression: 'voc * (1 + beta / 100 * (t - 25))',
    params: [
      { key: 'voc', label: 'Voc tại STC', unit: 'V' },
      { key: 'beta', label: 'Hệ số nhiệt βVoc', unit: '%/°C' },
      { key: 't', label: 'Nhiệt độ cell', unit: '°C' },
    ],
    resultUnit: 'V',
  },
  {
    id: 'string_voc_cold',
    name: 'Điện áp hở mạch chuỗi ở nhiệt độ thấp nhất',
    latex: 'V_{oc,string} = N \\cdot V_{oc,STC}\\,[1 + \\beta_{Voc}(T_{min} - 25)]',
    expression: 'n * voc * (1 + beta / 100 * (tmin - 25))',
    params: [
      { key: 'n', label: 'Số tấm/chuỗi', unit: '' },
      { key: 'voc', label: 'Voc tại STC', unit: 'V' },
      { key: 'beta', label: 'Hệ số nhiệt βVoc', unit: '%/°C' },
      { key: 'tmin', label: 'Nhiệt độ cell thấp nhất', unit: '°C' },
    ],
    resultUnit: 'V',
  },
  {
    id: 'max_modules_per_string',
    name: 'Số tấm tối đa trên một chuỗi',
    latex: 'N_{max} = \\left\\lfloor \\dfrac{V_{DC,max}}{V_{oc}(T_{min})} \\right\\rfloor',
    expression: 'floor(vmax / (voc * (1 + beta / 100 * (tmin - 25))))',
    params: [
      { key: 'vmax', label: 'Điện áp DC tối đa của inverter', unit: 'V' },
      { key: 'voc', label: 'Voc tại STC', unit: 'V' },
      { key: 'beta', label: 'Hệ số nhiệt βVoc', unit: '%/°C' },
      { key: 'tmin', label: 'Nhiệt độ cell thấp nhất', unit: '°C' },
    ],
    resultUnit: 'tấm',
  },
  {
    id: 'min_modules_per_string',
    name: 'Số tấm tối thiểu trên một chuỗi (theo dải MPPT)',
    latex: 'N_{min} = \\left\\lceil \\dfrac{V_{MPPT,min}}{V_{mp,STC}[1+\\gamma_{Vmp}(T_{max}-25)]} \\right\\rceil',
    expression: 'ceil(vmpptmin / (vmp * (1 + gamma / 100 * (tmax - 25))))',
    params: [
      { key: 'vmpptmin', label: 'Điện áp MPPT tối thiểu', unit: 'V' },
      { key: 'vmp', label: 'Vmp tại STC', unit: 'V' },
      { key: 'gamma', label: 'Hệ số nhiệt Vmp', unit: '%/°C' },
      { key: 'tmax', label: 'Nhiệt độ cell cao nhất', unit: '°C' },
    ],
    resultUnit: 'tấm',
  },
  {
    id: 'dc_ac_ratio',
    name: 'Tỷ lệ công suất DC/AC (DC/AC Ratio)',
    latex: 'R_{DC/AC} = \\dfrac{N \\cdot P_{module}}{P_{AC,inverter}}',
    expression: 'n * pmod / 1000 / pac',
    params: [
      { key: 'n', label: 'Số tấm pin', unit: '' },
      { key: 'pmod', label: 'Công suất tấm', unit: 'Wp' },
      { key: 'pac', label: 'Công suất AC định mức inverter', unit: 'kW' },
    ],
    resultUnit: '',
  },
  {
    id: 'vdrop_dc_percent',
    name: 'Sụt áp mạch DC (%)',
    latex: '\\Delta U\\% = \\dfrac{2 L I \\rho}{S \\cdot U} \\times 100',
    expression: '2 * l * i * rho / s / u * 100',
    params: [
      { key: 'l', label: 'Chiều dài tuyến một chiều', unit: 'm' },
      { key: 'i', label: 'Dòng điện', unit: 'A' },
      { key: 'rho', label: 'Điện trở suất', unit: 'Ω·mm²/m' },
      { key: 's', label: 'Tiết diện', unit: 'mm²' },
      { key: 'u', label: 'Điện áp vận hành', unit: 'V' },
    ],
    resultUnit: '%',
  },
  {
    id: 'vdrop_ac3_percent',
    name: 'Sụt áp mạch AC 3 pha (bỏ qua cảm kháng, %)',
    latex: '\\Delta U\\% = \\dfrac{\\sqrt{3}\\, L I \\rho \\cos\\varphi}{S \\cdot U_{LL}} \\times 100',
    expression: 'sqrt(3) * l * i * rho * pf / s / u * 100',
    params: [
      { key: 'l', label: 'Chiều dài tuyến', unit: 'm' },
      { key: 'i', label: 'Dòng điện pha', unit: 'A' },
      { key: 'rho', label: 'Điện trở suất', unit: 'Ω·mm²/m' },
      { key: 'pf', label: 'Hệ số công suất cosφ', unit: '' },
      { key: 's', label: 'Tiết diện', unit: 'mm²' },
      { key: 'u', label: 'Điện áp dây', unit: 'V' },
    ],
    resultUnit: '%',
  },
  {
    id: 'i_3phase',
    name: 'Dòng điện 3 pha',
    latex: 'I = \\dfrac{P}{\\sqrt{3}\\, U_{LL} \\cos\\varphi}',
    expression: 'p * 1000 / (sqrt(3) * u * pf)',
    params: [
      { key: 'p', label: 'Công suất tác dụng', unit: 'kW' },
      { key: 'u', label: 'Điện áp dây', unit: 'V' },
      { key: 'pf', label: 'Hệ số công suất', unit: '' },
    ],
    resultUnit: 'A',
  },
  {
    id: 'derated_ampacity',
    name: 'Khả năng mang dòng sau hiệu chỉnh',
    latex: "I_z' = I_z \\cdot k_{t} \\cdot k_{g}",
    expression: 'iz * kt * kg',
    params: [
      { key: 'iz', label: 'Dòng cho phép cơ sở', unit: 'A' },
      { key: 'kt', label: 'Hệ số nhiệt độ', unit: '' },
      { key: 'kg', label: 'Hệ số ghép nhóm', unit: '' },
    ],
    resultUnit: 'A',
  },
  {
    id: 'energy_yield',
    name: 'Sản lượng điện năm ước tính',
    latex: 'E = P_{kWp} \\cdot H \\cdot PR \\cdot 365',
    expression: 'p * h * pr * 365',
    params: [
      { key: 'p', label: 'Công suất lắp đặt', unit: 'kWp' },
      { key: 'h', label: 'Số giờ nắng đỉnh (PSH)', unit: 'h/ngày' },
      { key: 'pr', label: 'Hệ số hiệu suất (PR)', unit: '' },
    ],
    resultUnit: 'kWh/năm',
  },
  {
    id: 'battery_usable',
    name: 'Năng lượng khả dụng của pin',
    latex: 'E_{usable} = E_{nom} \\cdot DoD',
    expression: 'e * dod / 100',
    params: [
      { key: 'e', label: 'Dung lượng danh định', unit: 'kWh' },
      { key: 'dod', label: 'Độ sâu xả (DoD)', unit: '%' },
    ],
    resultUnit: 'kWh',
  },
  {
    id: 'simple_payback',
    name: 'Thời gian hoàn vốn đơn giản',
    latex: 'T = \\dfrac{CAPEX}{E \\cdot c - OPEX}',
    expression: 'capex / (e * price - opex)',
    params: [
      { key: 'capex', label: 'Vốn đầu tư', unit: 'VNĐ' },
      { key: 'e', label: 'Điện năng tiết kiệm/năm', unit: 'kWh' },
      { key: 'price', label: 'Giá điện', unit: 'VNĐ/kWh' },
      { key: 'opex', label: 'Chi phí vận hành/năm', unit: 'VNĐ' },
    ],
    resultUnit: 'năm',
  },
];

export function getTemplate(id: string) {
  return CALC_TEMPLATES.find((t) => t.id === id);
}

/** A calcSpec stored on a question. */
export interface CalcSpec {
  /** Either a template id or a raw expression. */
  templateId?: string;
  expression?: string;
  variables: Record<string, number>;
  unit?: string;
}

export function computeCalcSpec(spec: CalcSpec): number {
  const expr = spec.expression ?? (spec.templateId ? getTemplate(spec.templateId)?.expression : undefined);
  if (!expr) throw new Error('calcSpec thiếu biểu thức hoặc templateId hợp lệ');
  return evaluate(expr, spec.variables);
}

export function withinTolerance(
  actual: number,
  expected: number,
  tolerance: number,
  type: 'ABSOLUTE' | 'RELATIVE',
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const diff = Math.abs(actual - expected);
  const allowed = type === 'RELATIVE' ? Math.abs(expected) * tolerance : tolerance;
  return diff <= allowed + 1e-9;
}
