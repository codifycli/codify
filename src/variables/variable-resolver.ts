import { type VariableValue, type VariableValueType } from '@codifycli/schemas';

import { VariableError } from '../common/errors.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { VariableConfig } from '../entities/variable-config.js';
import { DependencyGraphResolver } from '../utils/dependency-graph-resolver.js';
import { conditionReferences, type ConditionValues, evaluateCondition } from './condition.js';
import { findReferences, substitute } from './substitution.js';
import { coerceVariableValue } from './variable-values.js';
import { SecretRedactor } from '../utils/secret-redactor.js';
import { isSavedKey } from './saved-references.js';

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
  // Variables whose passed value comes from a secret or a sensitive variable: they are sensitive in the template too
  passedSensitive?: Set<string>;
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

/** Saved variables and secrets of the config being run (see SavedValuesLoader). Their values are preset values. */
export interface SavedReferences {
  // Keys of the references that are secrets: their values are sensitive
  sensitiveKeys: Set<string>;
  // Why a reference that wasn't found is asked
  hints: Map<string, string>;
}
export type VariablePrompter = (request: VariablePromptRequest) => Promise<unknown>;

/** A variable shown in a {@link VariableForm} */
export type VariableFormField = Omit<VariablePromptRequest, 'error'>;

/**
 * All of the variables of a file (or of a template) that need a value, asked on a single screen. The fields depend on
 * the answers: variables appear and disappear with their when condition, and defaults that reference other variables
 * change with the answers.
 */
export interface VariableForm {
  // Labels of the templates the variables belong to, outermost first. Empty for the variables of the config itself.
  scope: string[];
  // Ex: 'codify.jsonc' or 'template @codify/astro-blog'
  location: string;
  /** The fields to show for the answers, in the order they are asked */
  fields(answers: Record<string, unknown>): VariableFormField[];
  /** Why an answer isn't valid, or undefined. An empty answer (undefined or '') uses the default of the variable. */
  validate(name: string, answer: unknown, answers: Record<string, unknown>): string | undefined;
}

/** Asks for all the fields of a form. Resolves the raw answers by variable name (missing or '' = use the default). */
export type VariableFormPrompter = (form: VariableForm) => Promise<Record<string, unknown>>;

const isEmptyAnswer = (answer: unknown) => answer === undefined || answer === '';

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

  /**
   * @param prompter asks for a single variable
   * @param presets values to use instead of asking (--var, forwarded values)
   * @param formPrompter if set, the variables of a file are asked together on a single screen (see VariableForm)
   */
  constructor(
    private readonly prompter: VariablePrompter = VariableResolver.noPrompt,
    presets: ResolvedVariable[] = [],
    private readonly formPrompter?: VariableFormPrompter,
    private readonly saved: SavedReferences = { hints: new Map(), sensitiveKeys: new Set() },
  ) {
    this.presets = new Map(presets.map((p) => [VariableResolver.qualifiedName(p.scope, p.name), p.value]));
  }

  /** A variable that is only referenced: a saved variable or secret (${{ secrets.user.NAME }}) or an implicit text variable */
  private implicitVariable(name: string): VariableConfig {
    return isSavedKey(name)
      ? VariableConfig.saved(name, this.saved.sensitiveKeys.has(name), this.saved.hints.get(name))
      : VariableConfig.implicit(name);
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

      const name = flag.slice(0, idx).trim();
      // Saved references (--var secrets.user.TOKEN=...) belong to the config being run
      if (isSavedKey(name)) {
        return { scope: [], name, value: flag.slice(idx + 1) };
      }

      const path = name.split('.');
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
      .map((name) => this.implicitVariable(name));

    const ordered = [...implicitInDefaults, ...this.sortVariables(variables, declaredNames, scope)];

    // Everything that needs a value is asked on a single screen first. Variables that are still missing afterwards
    // (there shouldn't be any) are asked one by one.
    const answers = await this.askWithForm(ordered, others, scope);

    for (const variable of ordered) {
      await this.resolveVariable(variable, scope, values, lookup(`The default of variable "${variable.name}"`), answers);
    }

    // Remove the declarations whose condition doesn't match
    const included = others.filter((d) => evaluateCondition(d.when, values));
    const removed = others.filter((d) => !included.includes(d));

    // Referenced but not declared: asked as text
    const implicit = [...new Set(included.flatMap((d) => [...VariableResolver.references(d)]))]
      .filter((name) => !values.has(name))
      .map((name) => this.implicitVariable(name));
    for (const variable of implicit) {
      await this.resolveVariable(variable, scope, values, lookup(`variable "${variable.name}"`), answers);
    }

    const sensitive = new Set([...variables, ...implicitInDefaults, ...implicit].filter((v) => v.sensitive).map((v) => v.name));
    for (const name of scope.passedSensitive ?? []) {
      sensitive.add(name);
    }
    for (const declaration of included) {
      if (declaration instanceof ResourceConfig) {
        VariableResolver.substituteResource(declaration, lookup(`Resource "${declaration.id}"`), sensitive);
      } else if (declaration.variables) {
        declaration.resolvedVariables = substitute(declaration.variables, lookup(`Template "${declaration.source}"`)) as Record<string, unknown>;
        // A value that comes from a secret stays sensitive inside the template
        declaration.resolvedSensitiveVariables = new Set(Object.entries(declaration.variables)
          .filter(([, value]) => [...findReferences(value)].some((name) => sensitive.has(name)))
          .map(([name]) => name));
      }
    }

    return {
      declarations: included,
      removedResourceIds: removed.filter((d) => d instanceof ResourceConfig).map((d) => d.id),
      removedTemplateIds: removed.filter((d) => d instanceof TemplateConfig).map((d) => d.id),
      // Saved references are not implicit variables: they are declared in the dashboard
      implicitVariables: [...implicitInDefaults, ...implicit].filter((v) => !v.savedReference).map((v) => VariableResolver.qualifiedName(scope.labels, v.name)),
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
    // Only the config being run reads saved variables and secrets. Templates get them as variables.
    const savedInTemplate = [...referenced].filter((name) => isSavedKey(name));
    if (scope.labels.length > 0 && savedInTemplate.length > 0) {
      throw new VariableError(scope.location, `Templates can't use saved variables or secrets (${savedInTemplate.join(', ')}). Declare a variable in the template and pass the value from the config being run, ex: "variables": { "token": "\${{ ${savedInTemplate[0]} }}" }.`);
    }

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

  /**
   * Asks for the variables of a scope on a single screen. Returns the answers by variable name, or undefined when there
   * is no form prompter or nothing to ask.
   */
  private async askWithForm(
    ordered: VariableConfig[],
    others: Array<ResourceConfig | TemplateConfig>,
    scope: VariableScope,
  ): Promise<Record<string, unknown> | undefined> {
    if (!this.formPrompter) {
      return undefined;
    }

    const fields = (answers: Record<string, unknown>) => this.formFields(ordered, others, scope, answers);
    const variableOf = (name: string) => ordered.find((v) => v.name === name) ?? this.implicitVariable(name);
    const form: VariableForm = {
      scope: scope.labels,
      location: scope.location,
      fields: (answers) => fields(answers).map((f) => f.field),
      validate(name, answer, answers) {
        const field = fields(answers).find((f) => f.field.name === name)?.field;
        if (isEmptyAnswer(answer)) {
          return field?.default === undefined ? 'A value is required' : undefined;
        }

        try {
          coerceVariableValue(variableOf(name), answer);
          return undefined;
        } catch (error) {
          return (error as Error).message;
        }
      },
    };

    if (form.fields({}).length === 0) {
      return undefined;
    }

    return this.formPrompter(form);
  }

  /**
   * The fields of the form for the answers. Runs the same steps as resolveScope without asking: evaluates the when
   * conditions with the answers (or the defaults) and finds the implicit variables of the declarations that are kept.
   * Variables that get their value from the template declaration or a preset are not shown.
   */
  private formFields(
    ordered: VariableConfig[],
    others: Array<ResourceConfig | TemplateConfig>,
    scope: VariableScope,
    answers: Record<string, unknown>,
  ): Array<{ field: VariableFormField }> {
    const values: ConditionValues = new Map();
    const fields: Array<{ field: VariableFormField }> = [];
    // Values that can't be computed yet (invalid answers, defaults using variables without a value) are left empty
    const lookup = (name: string) => {
      const value = values.get(name)?.value;
      if (value === undefined) throw new Error(`No value for ${name}`);
      return value;
    };

    const add = (variable: VariableConfig) => {
      if (!evaluateCondition(variable.when, values)) {
        values.set(variable.name, { value: undefined, multi: variable.isMulti });
        return;
      }

      const provided = this.providedValue(variable, scope);
      let defaultValue: undefined | VariableValue;
      if (provided === undefined) {
        try {
          defaultValue = variable.default === undefined ? undefined : coerceVariableValue(variable, substitute(variable.default, lookup));
        } catch {
          defaultValue = undefined;
        }

        fields.push({
          field: {
            name: variable.name,
            scope: scope.labels,
            valueType: variable.valueType,
            label: variable.label,
            description: variable.description,
            options: variable.options,
            default: defaultValue,
            sensitive: variable.sensitive,
            implicit: variable.implicit,
          },
        });
      }

      const raw = provided ?? (isEmptyAnswer(answers[variable.name]) ? defaultValue : answers[variable.name]);
      let value: undefined | VariableValue;
      try {
        value = raw === undefined ? undefined : coerceVariableValue(variable, raw);
      } catch {
        value = undefined;
      }

      values.set(variable.name, { value, multi: variable.isMulti });
    };

    for (const variable of ordered) {
      add(variable);
    }

    const included = others.filter((d) => evaluateCondition(d.when, values));
    for (const name of new Set(included.flatMap((d) => [...VariableResolver.references(d)]))) {
      if (!values.has(name)) {
        add(this.implicitVariable(name));
      }
    }

    return fields;
  }

  /** The value passed by the template declaration or a preset (--var, forwarded values). Undefined if there is none. */
  private providedValue(variable: VariableConfig, scope: VariableScope): unknown {
    return scope.passed && Object.hasOwn(scope.passed, variable.name)
      ? scope.passed[variable.name]
      : this.presets.get(VariableResolver.qualifiedName(scope.labels, variable.name));
  }

  private async resolveVariable(
    variable: VariableConfig,
    scope: VariableScope,
    values: ConditionValues,
    lookup: (name: string) => unknown,
    answers?: Record<string, unknown>,
  ): Promise<void> {
    if (!evaluateCondition(variable.when, values)) {
      values.set(variable.name, { value: undefined, multi: variable.isMulti });
      return;
    }

    const qualifiedName = VariableResolver.qualifiedName(scope.labels, variable.name);
    const provided = this.providedValue(variable, scope);

    let value: VariableValue;
    if (provided === undefined && answers && !isEmptyAnswer(answers[variable.name])) {
      // Answered on the form (already validated by the form)
      try {
        value = coerceVariableValue(variable, answers[variable.name]);
      } catch (error) {
        throw new VariableError(scope.location, `Invalid value for the variable "${qualifiedName}": ${(error as Error).message}`);
      }
    } else if (provided === undefined) {
      const defaultValue = this.resolveDefault(variable, scope, lookup);
      // Left empty on the form: the default
      value = answers && defaultValue !== undefined
        ? defaultValue
        : await this.ask(variable, scope, defaultValue);
    } else {
      try {
        value = coerceVariableValue(variable, provided);
      } catch (error) {
        throw new VariableError(scope.location, `Invalid value for the variable "${qualifiedName}": ${(error as Error).message}`);
      }
    }

    values.set(variable.name, { value, multi: variable.isMulti });
    this.resolved.push({ scope: scope.labels, name: variable.name, value });
    if (variable.sensitive || scope.passedSensitive?.has(variable.name)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        SecretRedactor.register(String(item));
      }
    }
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
