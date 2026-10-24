// PLAN D-1, the determinism lint: src/core/sim/** may use only exactly
// rounded operations. ECMA-262 leaves sin, cos, atan2, hypot, pow, exp and
// the other transcendental Math members implementation-approximated, and
// `**` with them; time, randomness and locale vary by machine.
// Ported from amorfus's gen-exact-ops rule.

const ALLOWED_MATH = new Set([
  'sqrt', 'floor', 'ceil', 'round', 'trunc', 'abs', 'min', 'max',
  'fround', 'imul', 'clz32',
  // Exact value properties.
  'PI', 'E', 'MAX_SAFE_INTEGER', 'MIN_SAFE_INTEGER',
]);

const BANNED_GLOBALS = new Set(['Date', 'performance', 'crypto', 'Intl']);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'allow only exactly rounded arithmetic in the simulation' },
    messages: {
      math: 'Math.{{name}} is implementation-approximated (ECMA-262); src/core/sim/** allows only the exact-ops list (PLAN D-1).',
      exponent: 'The ** operator is implementation-approximated; multiply, or use an allowed Math member (PLAN D-1).',
      global: '{{name}} differs between machines and is banned in src/core/sim/** (PLAN D-1).',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object.type !== 'Identifier' || node.object.name !== 'Math') return;
        let name = null;
        if (!node.computed && node.property.type === 'Identifier') name = node.property.name;
        else if (node.computed && node.property.type === 'Literal') name = String(node.property.value);
        if (name === null || !ALLOWED_MATH.has(name)) {
          context.report({ node, messageId: 'math', data: { name: name ?? '<computed>' } });
        }
      },
      BinaryExpression(node) {
        if (node.operator === '**') context.report({ node, messageId: 'exponent' });
      },
      AssignmentExpression(node) {
        if (node.operator === '**=') context.report({ node, messageId: 'exponent' });
      },
      Identifier(node) {
        if (!BANNED_GLOBALS.has(node.name)) return;
        const p = node.parent;
        // Only reads of the global: not `obj.performance`, keys or declarations.
        if (p.type === 'MemberExpression' && p.property === node && !p.computed) return;
        if (p.type === 'Property' && p.key === node && !p.computed) return;
        if ((p.type === 'VariableDeclarator' && p.id === node) || p.type === 'FunctionDeclaration') return;
        const scope = context.sourceCode.getScope(node);
        const ref = scope.references.find((r) => r.identifier === node);
        if (ref && ref.resolved && ref.resolved.defs.length > 0) return; // locally shadowed
        context.report({ node, messageId: 'global', data: { name: node.name } });
      },
    };
  },
};
