/**
 * PURPOSE    Resolve named CAD dimensions in dependency order.
 * KIND       CORE
 * CONTRACT   IN: VariableRequest; ordered definitions, document mm/inch units, C03
 *            expressions; non-unit names obey C03's case-sensitive ASCII identifier
 *            grammar. Definitions may reference later definitions; no external values.
 *            OUT: VariableResult with canonical C03 context, each name once in resolution
 *            order, and every name mapped to its unique lexically sorted direct consumers
 *            (empty when none). Roots follow input order; unresolved prerequisites follow
 *            C03 encounter order. Successful dependencies include zero-weight references.
 *            No input mutation, no shared input/output records or arrays; empty input works.
 *            RAISES: DuplicateNameError for a repeated name; ReservedNameError for
 *            mm/inch/in/deg/rad/°; both have variable:string and run in input-order preflight
 *            before evaluating any expression. VariableCycleError has variable:string for
 *            the definition closing the cycle, cycle:string[] containing only the active
 *            repeated-name segment plus its closing name, and that reference's offset/token.
 *            Propagates C03 errors with name/offset/token retained, variable:string naming
 *            the actual failing definition, a readable prefixed message and original cause.
 *            After preflight the first C03 failure or reached cycle wins; no partial result.
 * GUARANTEES Deterministic, pure, no I/O, host evaluation, placeholder variable values,
 *            duplicate expression parser or prototype lookup. C03 owns arithmetic/units.
 * TUNING     No tolerance or resource cutoff; RESERVED_NAMES follows C03's unit contract.
 * DECISIONS  D1: Resolve missing declared names using C03's located UnknownVariableError,
 *            then retry with real canonical prerequisites. Alternative: parse names again
 *            or evaluate dummy values; those can diverge from the grammar or introduce
 *            false division/unit failures. Revisit if: C03 gains a separate dependency port.
 *            D2: Use an iterative dependency stack. Alternative: recursive resolution
 *            exhausts the call stack on deep valid graphs. Revisit if: the approved input
 *            contract imposes a depth bound that makes recursion useful.
 * LIMITS     Identifier syntax is a caller precondition, validated by editor/file boundaries.
 *            First-error reporting, not a complete static cycle/error scan. Wide definitions
 *            can be evaluated repeatedly as prerequisites become known; no incremental cache.
 *            No feature graph, variable editor, document-unit migration or persisted values.
 * TESTBENCH  src/cad/named-variables.test.ts -- run with: node --import tsx --test src/cad/named-variables.test.ts
 */
import { evaluateDimension, type DimensionRequest } from './dimension-expressions.ts';

export type VariableRequest = Readonly<{
  units: DimensionRequest['context']['units'];
  variables: readonly Readonly<{ name: string; expression: DimensionRequest['expression'] }>[];
}>;
export type VariableResult = {
  context: DimensionRequest['context']; order: string[]; dependents: Record<string, string[]>;
};
type ExpressionFailure = Error & { offset: number; token: string };
const RESERVED_NAMES: readonly string[] = Object.freeze(['mm', 'inch', 'in', 'deg', 'rad', '°']);

export function evaluateVariables({ variables, units }: VariableRequest): VariableResult {
  const definitions = new Map<string, DimensionRequest['expression']>();
  const consumers = new Map<string, string[]>();
  for (const { name, expression } of variables) {
    if (RESERVED_NAMES.includes(name)) throw Object.assign(new Error(`Variable name ${JSON.stringify(name)} is reserved for a unit.`), {
      name: 'ReservedNameError', variable: name,
    });
    if (definitions.has(name)) throw Object.assign(new Error(`Variable ${JSON.stringify(name)} is defined more than once.`), {
      name: 'DuplicateNameError', variable: name,
    });
    definitions.set(name, expression); consumers.set(name, []);
  }
  // Null-prototype lookup permits ordinary valid identifiers such as __proto__.
  const resolved: Record<string, DimensionRequest['context']['variables'][string]> = Object.create(null);
  const context = { units, variables: resolved }, order: string[] = [], stack: string[] = [];
  const active = new Map<string, number>();
  for (const root of definitions.keys()) {
    if (Object.hasOwn(resolved, root)) continue;
    active.set(root, 0); stack.push(root);
    while (stack.length) {
      const current = stack.at(-1)!;
      let result: ReturnType<typeof evaluateDimension>;
      try { result = evaluateDimension({ expression: definitions.get(current)!, context }); }
      catch (cause) {
        if (!(cause instanceof Error)) throw cause;
        const failure = cause as ExpressionFailure;
        if (failure.name === 'UnknownVariableError' && definitions.has(failure.token)) {
          const repeated = active.get(failure.token);
          if (repeated !== undefined) {
            const cycle = [...stack.slice(repeated), failure.token];
            throw Object.assign(new Error(`Variable cycle: ${cycle.join(' -> ')}.`), {
              name: 'VariableCycleError', variable: current, cycle, offset: failure.offset, token: failure.token,
            });
          }
          active.set(failure.token, stack.length); stack.push(failure.token); continue;
        }
        throw Object.assign(new Error(`Variable ${JSON.stringify(current)}: ${failure.message}`, { cause }), {
          name: failure.name, variable: current, offset: failure.offset, token: failure.token,
        });
      }
      resolved[current] = { value: result.value, kind: result.kind }; order.push(current);
      // A dependency already resolved by another root still needs its reverse edge.
      for (const dependency of result.dependencies) consumers.get(dependency)!.push(current);
      stack.pop(); active.delete(current);
    }
  }
  return { context: { units, variables: Object.fromEntries(Object.entries(resolved)) }, order,
    dependents: Object.fromEntries([...consumers].map(([name, names]) => [name, names.sort()] as const)) };
}
