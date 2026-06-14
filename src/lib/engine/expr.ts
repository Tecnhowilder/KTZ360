// BRIVIA ENGINE V2 — Expresiones declarativas (sin eval()).
// Usadas en quantity_expr, waste_pct (overrides), condition_expr y visible_if
// del catálogo (catalog_questions, catalog_*_rules, catalog_recommendations).

export type ExprValue = number | string | boolean;
export type ExprContext = Record<string, ExprValue | undefined>;

export type Expr =
  | { const: ExprValue }
  | { var: string }
  | { op: 'add' | 'sub' | 'mul' | 'div' | 'max' | 'min'; args: Expr[] }
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'and' | 'or' | 'not'; args: Expr[] }
  | { op: 'if'; cond: Expr; then: Expr; else: Expr }
  | { op: 'lookup'; keys: string[]; table: Record<string, number> }
  | { op: 'ceil_div'; value: Expr; divisor: Expr }
  | { op: 'in'; value: Expr; list: (string | number)[] };

function toNum(v: ExprValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toBool(v: ExprValue): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return v !== '' && v !== '0' && v !== 'false';
}

export function evalExpr(expr: Expr, ctx: ExprContext): ExprValue {
  if ('const' in expr) return expr.const;
  if ('var' in expr) return ctx[expr.var] ?? 0;

  switch (expr.op) {
    case 'add':
      return expr.args.reduce((acc, e) => acc + toNum(evalExpr(e, ctx)), 0);
    case 'sub':
      return expr.args.map(e => toNum(evalExpr(e, ctx))).reduce((acc, n, i) => (i === 0 ? n : acc - n));
    case 'mul':
      return expr.args.reduce((acc, e) => acc * toNum(evalExpr(e, ctx)), 1);
    case 'div': {
      const [a, b] = expr.args.map(e => toNum(evalExpr(e, ctx)));
      return b === 0 ? 0 : a / b;
    }
    case 'max':
      return Math.max(...expr.args.map(e => toNum(evalExpr(e, ctx))));
    case 'min':
      return Math.min(...expr.args.map(e => toNum(evalExpr(e, ctx))));

    case 'eq':
      return evalExpr(expr.args[0], ctx) === evalExpr(expr.args[1], ctx);
    case 'neq':
      return evalExpr(expr.args[0], ctx) !== evalExpr(expr.args[1], ctx);
    case 'gt':
      return toNum(evalExpr(expr.args[0], ctx)) > toNum(evalExpr(expr.args[1], ctx));
    case 'gte':
      return toNum(evalExpr(expr.args[0], ctx)) >= toNum(evalExpr(expr.args[1], ctx));
    case 'lt':
      return toNum(evalExpr(expr.args[0], ctx)) < toNum(evalExpr(expr.args[1], ctx));
    case 'lte':
      return toNum(evalExpr(expr.args[0], ctx)) <= toNum(evalExpr(expr.args[1], ctx));
    case 'and':
      return expr.args.every(e => toBool(evalExpr(e, ctx)));
    case 'or':
      return expr.args.some(e => toBool(evalExpr(e, ctx)));
    case 'not':
      return !toBool(evalExpr(expr.args[0], ctx));

    case 'if':
      return toBool(evalExpr(expr.cond, ctx)) ? evalExpr(expr.then, ctx) : evalExpr(expr.else, ctx);

    case 'lookup': {
      const key = expr.keys.map(k => String(ctx[k] ?? '')).join('|');
      return expr.table[key] ?? 0;
    }

    case 'ceil_div': {
      const value = toNum(evalExpr(expr.value, ctx));
      const divisor = toNum(evalExpr(expr.divisor, ctx));
      return divisor === 0 ? 0 : Math.ceil(value / divisor);
    }

    case 'in': {
      const value = evalExpr(expr.value, ctx);
      return (expr.list as (string | number)[]).includes(value as string | number);
    }

    default:
      return 0;
  }
}

export function evalNumber(expr: Expr, ctx: ExprContext): number {
  return toNum(evalExpr(expr, ctx));
}

export function evalBool(expr: Expr, ctx: ExprContext): boolean {
  return toBool(evalExpr(expr, ctx));
}
