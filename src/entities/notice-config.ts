import {
  type Condition,
  type LinuxDistro,
  NoticeLevel,
  NoticeShow,
  NoticeStage,
  type ResourceOs,
  type NoticeConfig as SchemaNoticeConfig,
} from '@codifycli/schemas';

import { type ConfigBlock, ConfigType } from './config.js';
import { type ResourceOrigin } from './resource-config.js';

/**
 * Notice JSON supported format
 * {
 *   "type": "notice",
 *   "name?": "getting-started",
 *   "title?": "Getting started with your Astro site",
 *   "message": "1. cd ${{ projectDir }}\n2. npm run dev",
 *   "level?": "info" | "warning" | "success",
 *   "stage?": "apply" | "plan",
 *   "show?": "onChange" | "always",
 *   "dependsOn?": ["template.astro-blog"],
 *   "os?": [], "distro?": [], "when?": {}
 * }
 *
 * A notice is a core config block. It is never sent to a plugin. It is a message for the user: shown with the plan
 * (stage plan) or after the apply (stage apply, see NoticeEvaluator). Notices of a template are part of the template:
 * they remember how they were included (origins) like resources do.
 */
export class NoticeConfig implements ConfigBlock {
  readonly configClass = ConfigType.NOTICE;
  readonly type = ConfigType.NOTICE;

  raw: SchemaNoticeConfig;
  name?: string;
  // ${{ }} references are replaced by the VariableResolver
  title?: string;
  message: string;
  level: NoticeLevel;
  stage: NoticeStage;
  show: NoticeShow;
  dependsOn: string[];
  os?: ResourceOs[];
  distro?: LinuxDistro[];
  when?: Condition;
  sourceMapKey?: string;
  // How the notice was included. One origin without templates: declared in the project file.
  origins: ResourceOrigin[] = [{ templates: [] }];

  constructor(config: SchemaNoticeConfig, sourceMapKey?: string) {
    this.raw = config;
    this.name = config.name;
    this.title = config.title;
    this.message = config.message;
    this.level = config.level ?? NoticeLevel.INFO;
    this.stage = config.stage ?? NoticeStage.APPLY;
    this.show = config.show ?? NoticeShow.ON_CHANGE;
    this.dependsOn = config.dependsOn ?? [];
    this.os = config.os;
    this.distro = config.distro;
    this.when = config.when;
    this.sourceMapKey = sourceMapKey;
  }

  get id(): string {
    return this.name ? `${this.type}.${this.name}` : this.type;
  }

  get isFromTemplate(): boolean {
    return this.origins.some((o) => o.templates.length > 0);
  }

  /** The source of the template the notice was declared in (the innermost one). Undefined for the project file. */
  get templateSource(): string | undefined {
    return this.origins.find((o) => o.templates.length > 0)?.templates.at(-1)?.source;
  }
}
