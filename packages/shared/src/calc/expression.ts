/**
 * Small, safe arithmetic expression evaluator (no eval / Function).
 * Supports: numbers (incl. 1e-3), variables, + - * / ^, unary minus,
 * comparisons (< <= > >= == !=) returning 1/0, && || (1/0),
 * parentheses and a whitelist of functions.
 */

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: '('; v: '(' }
  | { t: ')'; v: ')' }
  | { t: ','; v: ',' };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: (x: number, d = 0) => {
    const f = 10 ** d;
    return Math.round((x + Number.EPSILON) * f) / f;
  },
  min: Math.min,
  max: Math.max,
  ln: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  pow: Math.pow,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  atan: Math.atan,
  acos: Math.acos,
  deg: (r: number) => (r * 180) / Math.PI,
  rad: (d: number) => (d * Math.PI) / 180,
  if: (c: number, a: number, b: number) => (c ? a : b),
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const PREC: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '^': 8,
  'u-': 7,
};
const RIGHT_ASSOC = new Set(['^', 'u-']);

export class ExpressionError extends Error {}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  if (src.length > 2000) throw new ExpressionError('Biểu thức quá dài');
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: parseFloat(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^<>'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      out.push({ t: c, v: c } as Token);
      i++;
      continue;
    }
    throw new ExpressionError(`Ký tự không hợp lệ trong biểu thức: "${c}"`);
  }
  return out;
}

type RpnItem =
  | { k: 'num'; v: number }
  | { k: 'var'; v: string }
  | { k: 'op'; v: string }
  | { k: 'fn'; v: string; argc: number };

function toRpn(tokens: Token[]): RpnItem[] {
  const out: RpnItem[] = [];
  const stack: Array<{ k: 'op'; v: string } | { k: '(' } | { k: 'fn'; v: string; argc: number }> = [];
  const argCount: number[] = [];
  let prev: Token | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]!;
    if (tk.t === 'num') out.push({ k: 'num', v: tk.v });
    else if (tk.t === 'id') {
      if (tokens[i + 1]?.t === '(') {
        if (!FUNCS[tk.v]) throw new ExpressionError(`Hàm không được hỗ trợ: ${tk.v}`);
        stack.push({ k: 'fn', v: tk.v, argc: 0 });
      } else out.push({ k: 'var', v: tk.v });
    } else if (tk.t === ',') {
      while (stack.length && stack[stack.length - 1]!.k !== '(') out.push(stack.pop() as RpnItem);
      if (!argCount.length) throw new ExpressionError('Dấu phẩy đặt sai vị trí');
      argCount[argCount.length - 1]!++;
    } else if (tk.t === 'op') {
      let op = tk.v;
      const unary = op === '-' && (!prev || prev.t === 'op' || prev.t === '(' || prev.t === ',');
      if (op === '+' && (!prev || prev.t === 'op' || prev.t === '(' || prev.t === ',')) {
        prev = tk;
        continue;
      }
      if (unary) op = 'u-';
      while (stack.length) {
        const top = stack[stack.length - 1]!;
        if (top.k !== 'op') break;
        const p1 = PREC[op]!;
        const p2 = PREC[top.v]!;
        if (p2 > p1 || (p2 === p1 && !RIGHT_ASSOC.has(op))) out.push(stack.pop() as RpnItem);
        else break;
      }
      stack.push({ k: 'op', v: op });
    } else if (tk.t === '(') {
      stack.push({ k: '(' });
      argCount.push(prev?.t === 'id' ? 1 : 0);
      if (tokens[i + 1]?.t === ')' && prev?.t === 'id') argCount[argCount.length - 1] = 0;
    } else if (tk.t === ')') {
      while (stack.length && stack[stack.length - 1]!.k !== '(') out.push(stack.pop() as RpnItem);
      if (!stack.length) throw new ExpressionError('Thiếu dấu ngoặc mở');
      stack.pop();
      const argc = argCount.pop() ?? 0;
      const top = stack[stack.length - 1];
      if (top && top.k === 'fn') {
        stack.pop();
        out.push({ k: 'fn', v: top.v, argc });
      }
    }
    prev = tk;
  }
  while (stack.length) {
    const s = stack.pop()!;
    if (s.k === '(') throw new ExpressionError('Thiếu dấu ngoặc đóng');
    out.push(s as RpnItem);
  }
  return out;
}

export function evaluate(expr: string, vars: Record<string, number> = {}): number {
  const rpn = toRpn(tokenize(expr));
  const st: number[] = [];
  for (const it of rpn) {
    if (it.k === 'num') st.push(it.v);
    else if (it.k === 'var') {
      if (it.v in vars) st.push(Number(vars[it.v]));
      else if (it.v in CONSTS) st.push(CONSTS[it.v]!);
      else throw new ExpressionError(`Biến chưa được định nghĩa: ${it.v}`);
    } else if (it.k === 'fn') {
      if (st.length < it.argc) throw new ExpressionError('Thiếu đối số hàm');
      const args = st.splice(st.length - it.argc, it.argc);
      st.push(FUNCS[it.v]!(...args));
    } else {
      if (it.v === 'u-') {
        if (!st.length) throw new ExpressionError('Biểu thức không hợp lệ');
        st.push(-st.pop()!);
        continue;
      }
      if (st.length < 2) throw new ExpressionError('Biểu thức không hợp lệ');
      const b = st.pop()!;
      const a = st.pop()!;
      switch (it.v) {
        case '+': st.push(a + b); break;
        case '-': st.push(a - b); break;
        case '*': st.push(a * b); break;
        case '/': st.push(a / b); break;
        case '^': st.push(a ** b); break;
        case '<': st.push(a < b ? 1 : 0); break;
        case '<=': st.push(a <= b ? 1 : 0); break;
        case '>': st.push(a > b ? 1 : 0); break;
        case '>=': st.push(a >= b ? 1 : 0); break;
        case '==': st.push(Math.abs(a - b) < 1e-12 ? 1 : 0); break;
        case '!=': st.push(Math.abs(a - b) >= 1e-12 ? 1 : 0); break;
        case '&&': st.push(a && b ? 1 : 0); break;
        case '||': st.push(a || b ? 1 : 0); break;
        default: throw new ExpressionError(`Toán tử không hỗ trợ: ${it.v}`);
      }
    }
  }
  if (st.length !== 1) throw new ExpressionError('Biểu thức không hợp lệ');
  const r = st[0]!;
  if (!Number.isFinite(r)) throw new ExpressionError('Kết quả không xác định (chia cho 0 hoặc tràn số)');
  return r;
}
