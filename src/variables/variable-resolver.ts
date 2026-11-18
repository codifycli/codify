import { type VariableValue, type VariableValueType } from '@codifycli/schemas';

import { VariableError } from '../common/errors.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { VariableConfig } from '../entities/variable-config.js';
import { DependencyGraphResolver } from '../utils/dependency-graph-resolver.js';
import { conditionReferences, type ConditionValues, evaluateCondition } from './condition.js';
import { findReferences, substitute } from './substitution.js';
import { coerceVariableValue } from './variable-values.js';

/** The value of a variable. Used to forward values to another run of Codify (ex: the `codify test` VM). */
export type ResolvedVariable = {
  // Labels of the templates the variable belongs to, outermost first. Empty for the variables of the config itself.
  scope: string[];
  name: string;
  value: VariableValue;
}

/** A variable that needs a value. Passed to {@link Reporter.promptVariable}. */
export type VariablePromptRequest = {
  name: string;
  // Labels of the templates the variable belongs to, outermost first. Empty for the variables of the config itself.
  scope: string[];
  valueType: VariableValueType;
  // The question to show. Undefined: show the name.
  label?: string;
  // Longer help text shown under the label
  description?: string;
  options?: string[];
  default?: VariableValue;
  sensitive: boolean;
  // Referenced with ${{ name }} but not declared with a variable block
  implicit: boolean;
  // Why the previous answer was not accepted
  error?: string;
}

export type VariableScope = {
  // Labels of the templates the scope was included through, outermost first. Empty for the config itself.
  labels: string[];
  // Shown in errors. Ex: 'codify.jsonc' or 'template @codify/astro-blog'
  location: string;
  // Values passed to the variables of a template by its declaration ("variables": { ... }). Already substituted.
  passed?: Record<string, unknown>;
}

export type ScopeResult = {
  // The resource and template declarations whose when matches. Their ${{ }} references are replaced.
  declarations: Array<ResourceConfig | TemplateConfig>;
  // Resource and template declarations that were removed because their when doesn't match
  removedResourceIds: string[];
  removedTemplateIds: string[];
  // Qualified names of the variables that are referenced but not declared
  implicitVariables: string[];
}

type Declaration = ResourceConfig | TemplateConfig | VariableConfig;
export type VariablePrompter = (request: VariablePromptRequest) => Promise<unknown>;

/**
 * Asks for the values of the variables of a config (or of a template) and applies them:
 *   1. Variables are asked in declaration order, unless a variable depends on another one (in its when or default).
 *      A variable whose when doesn't match is not asked and has no value.
 *   2. Resources and templates whose when doesn't match are removed.
 *   3. Variables that are referenced (${{ name }}) by the remaining declarations but not declared are asked as text.
 *   4. ${{ name }} references are replaced in the parameters of the resources and the variables passed to templates.
 *
 * Values are never saved. Values passed by a template declaration and preset values (--var, forwarded values) are used
 * instead of asking.
 */
export class VariableResolver {
  // Every value that was used. Forwarded to the `codify test` VM.
  readonly resolved: ResolvedVariable[] = [];
  private readonly presets: Map<string, unknown>;

  constructor(
    private readonly prompter: VariablePrompter = VariableResolver.noPrompt,
    presets: ResolvedVariable[] = [],
  ) {
    this.presets = new Map(presets.map((p) => [VariableResolver.qualifiedName(p.scope, p.name), p.value]));
  }

  /** Ex: astro-blog.projectName for the variable projectName of the template astro-blog */
  static qualifiedName(scope: string[], name: string): string {
    return [...scope, name].join('.');
  }

  /** Parses --var flags (name=value or template.name=value) */
  static parseVarFlags(flags: string[] = []): ResolvedVariable[] {
    return flags.map((flag) => {
      const idx = flag.indexOf('=');
      if (idx <= 0) {
        throw new Error(`Invalid --var "${flag}". Use --var name=value (or --var template.name=value for the variables of a template)`);
      }

      const path = flag.slice(0, idx).trim().split('.');
      return { scope: path.slice(0, -1), name: path.at(-1)!, value: flag.slice(idx + 1) };
    });
  }

  private static async noPrompt(request: VariablePromptRequest): Promise<unknown> {
    throw new Error(`The variable "${VariableResolver.qualifiedName(request.scope, request.name)}" needs a value`);
  }

  async resolveScope(declarations: Declaration[], scope: VariableScope): Promise<ScopeResult> {
    const variables = declarations.filter((d): d is VariableConfig => d instanceof VariableConfig);
    const others = declarations.filter((d): d is ResourceConfig | TemplateConfig => !(d instanceof VariableConfig));

    const declared = this.validate(variables, others, scope);
    const values: ConditionValues = new Map();
    const lookup = (usedBy: string) => (name: string) => {
      const variable = values.get(name);
      if (variable?.value === undefined) {
        throw new VariableError(scope.location, `${usedBy} uses \${{ ${name} }} but the variable has no value: its when condition doesn't match. Add the same condition to ${usedBy}.`);
      }

      return variable.value;
    };

    // Variables referenced in defaults without a declaration are asked first, then the declared variables
    const declaredNames = new Set(declared.keys());
    const implicitInDefaults = [...new Set(variables.flatMap((v) => [...findReferences(v.default)]))]
      .filter((name) => !declaredNames.has(name))
      .map((name) => VariableConfig.implicit(name));

    for (const variable of [...implicitInDefaults, ...this.sortVariables(variables, declaredNames, scope)]) {
      await this.resolveVariable(variable, scope, values, lookup(`The default of variable "${variable.name}"`));
    }

    // Remove the declarations whose condition doesn't match
    const included = others.filter((d) => evaluateCondition(d.when, values));
    const removed = others.filter((d) => !included.includes(d));

    // Referenced but not declared: asked as text
    const implicit = [...new Set(included.flatMap((d) => [...VariableResolver.references(d)]))]
      .filter((name) => !values.has(name))
      .map((name) => VariableConfig.implicit(name));
    for (const variable of implicit) {
      await this.resolveVariable(variable, scope, values, lookup(`variable "${variable.name}"`));
    }

    const sensitive = new Set(variables.filter((v) => v.sensitive).map((v) => v.name));
    for (const declaration of included) {
      if (declaration instanceof ResourceConfig) {
        VariableResolver.substituteResource(declaration, lookup(`Resource "${declaration.id}"`), sensitive);
      } else if (declaration.variables) {
        declaration.resolvedVariables = substitute(declaration.variables, lookup(`Template "${declaration.source}"`)) as Record<string, unknown>;
      }
    }

    return {
      declarations: included,
      removedResourceIds: removed.filter((d) => d instanceof ResourceConfig).map((d) => d.id),
      removedTemplateIds: removed.filter((d) => d instanceof TemplateConfig).map((d) => d.id),
      implicitVariables: [...implicitInDefaults, ...implicit].map((v) => VariableResolver.qualifiedName(scope.labels, v.name)),
    };
  }

  private validate(variables: VariableConfig[], others: Array<ResourceConfig | TemplateConfig>, scope: VariableScope) {
    const declared = new Map<string, VariableConfig>();
    for (const variable of variables) {
      if (declared.has(variable.name)) {
        throw new VariableError(scope.location, `The variable "${variable.name}" is declared more than once`);
      }

      declared.set(variable.name, variable);
    }

    // Conditions can only use declared variables. A typo would silently skip resources otherwise.
    const withConditions: Array<{ label: string; when: VariableConfig['when'] }> = [
      ...variables.map((v) => ({ label: `Variable "${v.name}"`, when: v.when })),
      ...others.map((d) => ({ label: d instanceof ResourceConfig ? `Resource "${d.id}"` : `Template "${d.source}"`, when: d.when })),
    ];
    for (const { label, when } of withConditions) {
      const unknown = conditionReferences(when).filter((name) => !declared.has(name));
      if (unknown.length > 0) {
        throw new VariableError(scope.location, `${label} has a when condition on ${unknown.map((n) => `"${n}"`).join(', ')}, which ${unknown.length === 1 ? 'is' : 'are'} not declared. Declare ${unknown.length === 1 ? 'it' : 'them'} with { "type": "variable", "name": "${unknown[0]}" }.`);
      }
    }

    // Values passed to a template must be for one of its variables
    const referenced = new Set([
      ...variables.flatMap((v) => [...findReferences(v.default)]),
      ...others.flatMap((d) => [...VariableResolver.references(d)]),
    ]);
    const unknownPassed = Object.keys(scope.passed ?? {}).filter((name) => !declared.has(name) && !referenced.has(name));
    if (unknownPassed.length > 0) {
      throw new VariableError(scope.location, `The template has no variable ${unknownPassed.map((n) => `"${n}"`).join(', ')}. Remove ${unknownPassed.length === 1 ? 'it' : 'them'} from the "variables" of the template declaration.`);
    }

    return declared;
  }

  private sortVariables(variables: VariableConfig[], declaredNames: Set<string>, scope: VariableScope): VariableConfig[] {
    const dependencies = (v: VariableConfig) => [...new Set([
      ...conditionReferences(v.when),
      ...findReferences(v.default),
    ])].filter((name) => declaredNames.has(name));

    for (const variable of variables) {
      if (dependencies(variable).includes(variable.name)) {
        throw new VariableError(scope.location, `The variable "${variable.name}" references itself in its when condition or default`);
      }
    }

    let order: string[];
    try {
      order = DependencyGraphResolver.calculateDependencyList(variables, (v) => v.name, dependencies);
    } catch {
      throw new VariableError(scope.location, `Variables reference each other in a cycle (in their when conditions or defaults): ${variables.filter((v) => dependencies(v).length > 0).map((v) => v.name).join(', ')}`);
    }

    return order.map((name) => variables.find((v) => v.name === name)!);
  }

  private async resolveVariable(
    variable: VariableConfig,
    scope: VariableScope,
    values: ConditionValues,
    lookup: (name: string) => unknown,
  ): Promise<void> {
    if (!evaluateCondition(variable.when, values)) {
      values.set(variable.name, { value: undefined, multi: variable.isMulti });
      return;
    }

    const qualifiedName = VariableResolver.qualifiedName(scope.labels, variable.name);
    const provided = scope.passed && Object.hasOwn(scope.passed, variable.name)
      ? scope.passed[variable.name]
      : this.presets.get(qualifiedName);

    let value: VariableValue;
    if (provided === undefined) {
      value = await this.ask(variable, scope, this.resolveDefault(variable, scope, lookup));
    } else {
      try {
        value = coerceVariableValue(variable, provided);
      } catch (error) {
        throw new VariableError(scope.location, `Invalid value for the variable "${qualifiedName}": ${(error as Error).message}`);
      }
    }

    values.set(variable.name, { value, multi: variable.isMulti });
    this.resolved.push({ scope: scope.labels, name: variable.name, value });
  }

  private resolveDefault(variable: VariableConfig, scope: VariableScope, lookup: (name: string) => unknown): undefined | VariableValue {
    if (variable.default === undefined) {
      return undefined;
    }

    try {
      return coerceVariableValue(variable, substitute(variable.default, lookup));
    } catch (error) {
      if (error instanceof VariableError) {
        throw error;
      }

      throw new VariableError(scope.location, `Invalid default for the variable "${variable.name}": ${(error as Error).message}`);
    }
  }

  private async ask(variable: VariableConfig, scope: VariableScope, defaultValue: undefined | VariableValue): Promise<VariableValue> {
    let error: string | undefined;

    // Asked again until the answer is valid
    while (true) {
      const answer = await this.prompter({
        name: variable.name,
        scope: scope.labels,
        valueType: variable.valueType,
        label: variable.label,
        description: variable.description,
        options: variable.options,
        default: defaultValue,
        sensitive: variable.sensitive,
        implicit: variable.implicit,
        error,
      });

      // No answer: use the default
      if ((answer === undefined || answer === '') && defaultValue !== undefined) {
        return defaultValue;
      }

      try {
        return coerceVariableValue(variable, answer);
      } catch (error_) {
        error = (error_ as Error).message;
      }
    }
  }

  /** Variables referenced by a resource (parameters) or a template declaration (values passed to the template) */
  private static references(declaration: ResourceConfig | TemplateConfig): Set<string> {
    return declaration instanceof ResourceConfig
      ? findReferences(declaration.parameters)
      : findReferences(declaration.variables);
  }

  private static substituteResource(resource: ResourceConfig, lookup: (name: string) => unknown, sensitive: Set<string>) {
    for (const [key, value] of Object.entries(resource.parameters)) {
      const references = findReferences(value);
      // Escaped references are replaced as well (they become a literal reference)
      if (references.size === 0 && !JSON.stringify(value).includes('$${{')) {
        continue;
      }

      if ([...references].some((name) => sensitive.has(name))) {
        resource.sensitiveParameterKeys.add(key);
      }

      resource.setParameter(key, substitute(value, lookup));
    }
  }
}
